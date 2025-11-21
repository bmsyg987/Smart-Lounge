const API = "/api";
let currentUser = null;
let currentBuildingId = null;
let currentLoungeId = null;
let selectedSeatId = null;
let currentAdminMode = null; 

function showPage(pid) {
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
        if (p.id === pid) {
            p.style.display = 'block';
            setTimeout(() => p.classList.add('active'), 10);
        }
    });
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('login-id').value;
    const pw = document.getElementById('login-pw').value;
    try {
        const res = await fetch(API + '/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id, pw})
        });
        const data = await res.json();
        if (data.result === 'success') {
            currentUser = data.user;
            showPage('page-main');
            await loadBuildings();
            setupUIByRole();
        } else alert(data.message);
    } catch (e) { alert('서버 연결 오류'); }
});

function setupUIByRole() {
    const roleNames = {'admin': '총관리자', 'manager': '건물매니저', 'user': '사용자'};
    document.getElementById('header-role').innerText = roleNames[currentUser.role];
    document.getElementById('header-name').innerText = currentUser.name;
    
    const adminP = document.getElementById('admin-panel');
    const userS = document.getElementById('user-sidebar');
    const superC = document.getElementById('super-admin-controls');
    const bSel = document.getElementById('building-select');

    if (currentUser.role === 'admin') {
        adminP.classList.remove('hidden');
        userS.classList.add('hidden');
        superC.classList.remove('hidden');
        bSel.disabled = false;
        loadLostItems(); 
    } else if (currentUser.role === 'manager') {
        adminP.classList.remove('hidden');
        userS.classList.add('hidden');
        superC.classList.add('hidden');
        bSel.value = currentUser.managed_building_id;
        bSel.disabled = true;
        onBuildingChange();
        loadLostItems();
    } else {
        adminP.classList.add('hidden');
        userS.classList.remove('hidden');
        bSel.disabled = false;
    }
}

async function loadBuildings() {
    const res = await fetch(API + '/buildings');
    const b = await res.json();
    const sel = document.getElementById('building-select');
    sel.innerHTML = '<option value="">-- 건물 선택 --</option>';
    b.forEach(x => sel.innerHTML += `<option value="${x.id}">${x.name}</option>`);
}

async function onBuildingChange() {
    currentBuildingId = document.getElementById('building-select').value;
    currentLoungeId = null;
    document.getElementById('map-area').innerHTML = '<div id="map-placeholder">라운지를 선택하세요</div>';
    if (currentBuildingId) await loadLounges(currentBuildingId);
    else document.getElementById('lounge-select').innerHTML = '';
}

async function loadLounges(bid) {
    const res = await fetch(API + `/lounges?buildingId=${bid}`);
    const l = await res.json();
    const sel = document.getElementById('lounge-select');
    sel.innerHTML = '<option value="">-- 라운지 선택 --</option>';
    l.forEach(x => sel.innerHTML += `<option value="${x.id}">${x.name}</option>`);
}

async function onLoungeChange() {
    const v = document.getElementById('lounge-select').value;
    currentLoungeId = v ? parseInt(v) : null;
    if (currentLoungeId) loadSeats();
    else document.getElementById('map-area').innerHTML = '<div id="map-placeholder">라운지를 선택하세요</div>';
}

async function loadSeats() {
    if (!currentLoungeId) return;
    const res = await fetch(API + `/seats?loungeId=${currentLoungeId}`);
    const seats = await res.json();
    const c = document.getElementById('map-area');
    c.innerHTML = '';
    if (currentUser.role !== 'user') document.getElementById('admin-total-seats').value = seats.length;

    seats.forEach(s => {
        const el = document.createElement('div');
        el.className = 'seat';
        el.style.left = s.x + 'px';
        el.style.top = s.y + 'px';
        el.dataset.id = s.id;

        let h = `<span>${s.id}</span>`;
        if (s.hasPower) { el.classList.add('has-power'); h += `<div class="icon-power">⚡</div>`; }
        
        if (s.status === 'occupied') {
            el.classList.add('occupied');
            if (s.endTime) h += `<div class="time-badge">~${s.endTime}</div>`;
            
            if (currentUser.role !== 'user' && s.warningCount > 0) {
                el.classList.add('warning-user');
                h += `<div class="warning-badge">⚠️벌점${s.warningCount}</div>`;
            }
            if (currentUser && s.userId === currentUser.id) {
                el.classList.remove('occupied'); el.classList.add('mine');
                h += `<div class="my-badge">MY</div>`;
                updateMyStatus(s);
            }
        }
        el.innerHTML = h;

        if (currentUser.role !== 'user') el.onmousedown = (e) => adminSeatAction(e, s, el);
        else el.onclick = () => userClickSeat(s, el);
        c.appendChild(el);
    });

    if (currentUser.role === 'user' && !seats.find(x => x.userId === currentUser.id)) updateMyStatus(null);
    if (currentUser.role !== 'user' && currentAdminMode) applyAdminMode();
}


async function loadLostItems() {
    const payload = {
        role: currentUser.role,
        managedBuildingId: currentUser.managed_building_id || null 
    };
    
    try {
        const res = await fetch(API + '/admin/lost_items', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const items = await res.json();
        const tb = document.getElementById('lost-items-body');
        tb.innerHTML = '';
        
        if (!items || items.length === 0) {
            tb.innerHTML = '<tr><td colspan="7" style="padding:20px;">등록된 분실물이 없습니다.</td></tr>';
        } else {
            items.forEach(i => {
                tb.innerHTML += `
                    <tr>
                        <td>${i.date}</td><td>${i.time}</td><td>${i.building}</td>
                        <td>${i.lounge}</td><td>${i.seat_id ? i.seat_id+'번' : '-'}</td>
                        <td style="color:#d32f2f;font-weight:bold">${i.item}</td>
                        <td><button class="btn-small btn-red-text" onclick="deleteLostItem(${i.id})">처리완료</button></td>
                    </tr>`;
            });
        }
    } catch(e) { console.error(e); }
}

async function deleteLostItem(id) {
    if (confirm('처리 완료하시겠습니까?')) {
        await fetch(API + '/admin/delete_lost_item', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id})
        });
        loadLostItems();
    }
}

function adminSeatAction(e, s, el) {
    if (currentAdminMode === 'power') { togglePower(s.id); return; }
    if (currentAdminMode === 'layout') return;
    if (s.status === 'occupied') {
        if (confirm(`${s.userId}님을 강제 퇴실 처리하시겠습니까?`)) forceCancel(s.id);
    }
}
async function forceCancel(seatId) {
    const res = await fetch(API + '/admin/force_cancel', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({loungeId: currentLoungeId, seatId: seatId})
    });
    if ((await res.json()).result === 'success') { alert('처리 완료'); loadSeats(); } else alert('오류');
}
function setAdminMode(m) {
    if (!currentLoungeId) return;
    currentAdminMode = (currentAdminMode === m) ? null : m;
    document.querySelectorAll('.admin-btn').forEach(b => b.classList.remove('active-mode'));
    if (currentAdminMode) event.target.classList.add('active-mode');
    applyAdminMode();
}
function applyAdminMode() {
    const seats = document.querySelectorAll('.seat');
    const saveBtn = document.getElementById('btn-save-layout');
    const msg = document.getElementById('admin-msg');
    seats.forEach(x => { x.classList.remove('mode-layout', 'mode-power'); x.onmousedown = null; x.draggable = false; });
    saveBtn.classList.add('hidden'); msg.innerText = "";
    if (currentAdminMode === 'layout') {
        msg.innerText = "드래그하여 배치"; saveBtn.classList.remove('hidden');
        seats.forEach(x => { x.classList.add('mode-layout'); makeDraggable(x); });
    } else if (currentAdminMode === 'power') {
        msg.innerText = "클릭하여 콘센트 설정";
        seats.forEach(x => { x.classList.add('mode-power'); x.onclick = () => togglePower(x.dataset.id); });
    } else loadSeats();
}
function makeDraggable(el) {
    let p1=0, p2=0, p3=0, p4=0;
    el.onmousedown = (e) => {
        if (currentAdminMode !== 'layout') return;
        e.preventDefault(); p3=e.clientX; p4=e.clientY;
        document.onmouseup = () => { document.onmouseup=null; document.onmousemove=null; };
        document.onmousemove = (e) => { e.preventDefault(); p1=p3-e.clientX; p2=p4-e.clientY; p3=e.clientX; p4=e.clientY; el.style.top=(el.offsetTop-p2)+"px"; el.style.left=(el.offsetLeft-p1)+"px"; };
    };
}
async function saveLayout() {
    const l=[]; document.querySelectorAll('.seat').forEach(s=>l.push({seatId:parseInt(s.dataset.id), x:s.offsetLeft, y:s.offsetTop}));
    await fetch(API+'/admin/layout', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({loungeId:currentLoungeId, layout:l})});
    alert('저장 완료'); currentAdminMode=null; applyAdminMode();
}
async function setTotalSeats() {
    await fetch(API+'/admin/config', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({loungeId:currentLoungeId, totalSeats:document.getElementById('admin-total-seats').value})}); loadSeats();
}
async function togglePower(sid) {
    await fetch(API+'/admin/power', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({loungeId:currentLoungeId, seatId:parseInt(sid)})}); loadSeats();
}

function userClickSeat(s, el) {
    if (s.status === 'occupied' && s.userId !== currentUser.id) return alert('사용 중인 좌석');
    if (s.userId === currentUser.id) return;
    document.querySelectorAll('.seat').forEach(x => x.classList.remove('selected'));
    el.classList.add('selected'); selectedSeatId = s.id;
    document.getElementById('reserve-panel').classList.remove('hidden');
    document.getElementById('selected-seat-display').innerText = s.id;
    const now = new Date(); now.setHours(now.getHours() + 2);
    document.getElementById('reserve-time').value = now.toTimeString().substring(0, 5);
    document.getElementById('booking-form').classList.remove('hidden');
    document.getElementById('report-lost-form').classList.add('hidden');
}
async function requestReserve() {
    if (!selectedSeatId) return;
    const t = document.getElementById('reserve-time').value;
    const res = await fetch(API + '/seats/reserve', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({loungeId: currentLoungeId, seatId: selectedSeatId, userId: currentUser.id, endTime: t})
    });
    const j = await res.json();
    if (j.result === 'success') { alert('예약되었습니다.'); cancelSelection(); loadSeats(); }
    else alert(j.message);
}
function updateMyStatus(s) {
    const st = document.getElementById('my-status-text'), bt = document.getElementById('btn-checkout');
    if (s) {
        st.innerHTML = `<b style="color:#007bff">${s.id}번</b> 이용중`;
        document.getElementById('my-time-text').innerText = `~${s.endTime} 퇴실`;
        bt.classList.remove('hidden'); document.getElementById('reserve-panel').classList.add('hidden');
        bt.onclick = async () => { if (confirm('퇴실?')) { await fetch(API + '/seats/checkout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId: currentUser.id})}); loadSeats(); } };
    } else { st.innerText = "이용 중인 좌석 없음"; document.getElementById('my-time-text').innerText = ""; bt.classList.add('hidden'); }
}
function cancelSelection() { selectedSeatId = null; document.querySelectorAll('.seat').forEach(x => x.classList.remove('selected')); document.getElementById('reserve-panel').classList.add('hidden'); }
function toggleLostForm() { const f = document.getElementById('report-lost-form'), b = document.getElementById('booking-form'); f.classList.toggle('hidden'); b.classList.toggle('hidden'); }
async function submitLostReport() { if (!selectedSeatId) return; await fetch(API + '/lost/report', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({loungeId: currentLoungeId, seatId: selectedSeatId, item: document.getElementById('lost-item-desc').value})}); alert('신고 완료'); cancelSelection(); }
function showAdminTab(t) { document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active')); event.target.classList.add('active'); document.getElementById('admin-tab-settings').classList.toggle('hidden', t !== 'settings'); document.getElementById('admin-tab-lost').classList.toggle('hidden', t !== 'lost'); if (t === 'lost') loadLostItems(); }

document.getElementById('form-signup').addEventListener('submit', async (e) => { e.preventDefault(); try { const res = await fetch(API + '/signup', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: document.getElementById('sign-name').value, studentId: document.getElementById('sign-std-id').value, id: document.getElementById('sign-id').value, pw: document.getElementById('sign-pw').value, adminCode: document.getElementById('sign-admin-code').value})}); if ((await res.json()).result === 'success') { alert('가입 완료'); showPage('page-login'); } else alert('실패'); } catch (e) {} });
async function openAddBuilding() { const n = prompt("이름"), i = prompt("ID"); if (n && i) { await fetch(API + '/admin/add_building', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: i, name: n})}); loadBuildings(); } }
async function openAddLounge() { if (!currentBuildingId) return alert('건물 선택'); const n = prompt("이름"); if (n) { await fetch(API + '/admin/add_lounge', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({buildingId: currentBuildingId, name: n})}); loadLounges(currentBuildingId); } }
function logout() { location.reload(); }