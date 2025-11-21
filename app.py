from flask import Flask, render_template, request, jsonify
import pymysql
from datetime import datetime

app = Flask(__name__)

db_config = {
    'host': 'localhost', 'user': 'root', 'password': 'lastline12!@#$',
    'db': 'SmartLounge',
    'charset': 'utf8mb4', 'cursorclass': pymysql.cursors.DictCursor
}

def get_db():
    return pymysql.connect(**db_config)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/signup', methods=['POST'])
def signup():
    d = request.get_json()
    uid, upw, name = d.get('id'), d.get('pw'), d.get('name')
    student_id = d.get('studentId')
    admin_code = d.get('adminCode')

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM users WHERE id=%s", (uid,))
        if cur.fetchone(): return jsonify({"result": "fail", "message": "이미 존재하는 ID입니다."}), 400

        role = 'user'
        building_id = None

        if admin_code == 'adminset':
            role = 'admin'
        elif admin_code and admin_code.startswith('manager_'):
            parts = admin_code.split('_')
            if len(parts) < 2: return jsonify({"result": "fail", "message": "잘못된 코드"}), 400
            building_id = parts[1]
            cur.execute("SELECT id FROM building WHERE id=%s", (building_id,))
            if not cur.fetchone(): return jsonify({"result": "fail", "message": "존재하지 않는 건물 ID"}), 400
            role = 'manager'
        else:
            if not student_id: return jsonify({"result": "fail", "message": "학번 필수"}), 400
        
        cur.execute("INSERT INTO users (id, pw, name, role) VALUES (%s, %s, %s, %s)", (uid, upw, name, role))
        if role == 'user':
            cur.execute("INSERT INTO students (user_id, student_num) VALUES (%s, %s)", (uid, student_id))
        elif role == 'manager':
            cur.execute("INSERT INTO managers (user_id, building_id) VALUES (%s, %s)", (uid, building_id))
        
        conn.commit()
        return jsonify({"result": "success"})
    except Exception as e:
        conn.rollback()
        return jsonify({"result": "fail", "message": str(e)}), 500
    finally: conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.name, u.role, m.building_id AS managed_building_id
        FROM users u
        LEFT JOIN managers m ON u.id = m.user_id
        WHERE u.id=%s AND u.pw=%s
    """, (d['id'], d['pw']))
    user = cur.fetchone()
    conn.close()
    if user: return jsonify({"result": "success", "user": user})
    return jsonify({"result": "fail", "message": "로그인 실패"}), 401


@app.route('/api/buildings', methods=['GET'])
def get_buildings():
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, name FROM building ORDER BY id")
    res = cur.fetchall(); conn.close()
    return jsonify(res)

@app.route('/api/lounges', methods=['GET'])
def get_lounges():
    bid = request.args.get('buildingId')
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, name FROM lounge WHERE building_id=%s ORDER BY id", (bid,))
    res = cur.fetchall(); conn.close()
    return jsonify(res)


@app.route('/api/seats', methods=['GET'])
def get_seats():
    lid = request.args.get('loungeId')
    if not lid: return jsonify([])
    
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("UPDATE reservation SET status='completed' WHERE status='active' AND end_time < NOW()")
    conn.commit()

    query = """
        SELECT 
            s.id AS db_pk, s.seat_num, s.x, s.y, s.has_power,
            r.user_id AS userId,
            r.end_time, 
            u.name AS userName,
            (SELECT COUNT(*) FROM penalty p WHERE p.user_id = r.user_id) AS warningCount
        FROM seat s
        LEFT JOIN reservation r ON s.id = r.seat_id AND r.status = 'active'
        LEFT JOIN users u ON r.user_id = u.id
        WHERE s.lounge_id = %s
    """
    cur.execute(query, (lid,))
    seats = cur.fetchall()
    conn.close()
    
    res = []
    for s in seats:
        end_time_str = s['end_time'].strftime("%H:%M") if s['end_time'] else None
        
        status = 'occupied' if s['userId'] else 'available'
        res.append({
            'id': s['seat_num'],
            'db_id': s['db_pk'],
            'x': s['x'], 'y': s['y'],
            'hasPower': bool(s['has_power']),
            'status': status,
            'userId': s['userId'],
            'userName': s['userName'],
            'endTime': end_time_str, 
            'warningCount': s['warningCount'] if s['warningCount'] else 0
        })
    return jsonify(res)


@app.route('/api/seats/reserve', methods=['POST'])
def reserve():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    try:
        current_time = datetime.now()
        end_dt_str = current_time.strftime("%Y-%m-%d ") + d['endTime']
        end_dt = datetime.strptime(end_dt_str, "%Y-%m-%d %H:%M")

        if end_dt <= current_time:
            return jsonify({"result": "fail", "message": "종료 시점은 현재보다 이후여야 합니다."}), 400

        cur.execute("SELECT id FROM reservation WHERE user_id=%s AND status='active'", (d['userId'],))
        if cur.fetchone():
            return jsonify({"result": "fail", "message": "이미 이용 중인 좌석이 있습니다. 퇴실 후 예약하세요."}), 400

        cur.execute("SELECT id FROM seat WHERE lounge_id=%s AND seat_num=%s", (d['loungeId'], d['seatId']))
        seat_row = cur.fetchone()
        if not seat_row: return jsonify({"result": "fail", "message": "좌석 없음"}), 400
        
        real_seat_id = seat_row['id']

        cur.execute("SELECT id FROM reservation WHERE seat_id=%s AND status='active'", (real_seat_id,))
        if cur.fetchone(): return jsonify({"result": "fail", "message": "이미 예약된 좌석"}), 400

        cur.execute("""
            INSERT INTO reservation (user_id, seat_id, lounge_id, end_time, status)
            VALUES (%s, %s, %s, %s, 'active')
        """, (d['userId'], real_seat_id, d['loungeId'], end_dt))
        
        conn.commit()
        return jsonify({"result": "success"})
    except Exception as e:
        conn.rollback()
        return jsonify({"result": "fail", "message": str(e)}), 500
    finally: conn.close()

@app.route('/api/seats/checkout', methods=['POST'])
def checkout():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE reservation SET status='completed' WHERE user_id=%s AND status='active'", (d['userId'],))
    conn.commit()
    conn.close()
    return jsonify({"result": "success"})

@app.route('/api/admin/force_cancel', methods=['POST'])
def force_cancel():
    d = request.get_json()
    lid, seat_num = int(d['loungeId']), int(d['seatId'])
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT user_id FROM reservation WHERE seat_id=(SELECT id FROM seat WHERE lounge_id=%s AND seat_num=%s) AND status='active'", (lid, seat_num))
        row = cur.fetchone()
        if row:
            cur.execute("UPDATE reservation SET status='cancelled' WHERE seat_id=(SELECT id FROM seat WHERE lounge_id=%s AND seat_num=%s) AND status='active'", (lid, seat_num))
            cur.execute("INSERT INTO penalty (user_id, reason) VALUES (%s, '관리자 강제 퇴실')", (row['user_id'],))
            conn.commit()
            return jsonify({"result": "success"})
        return jsonify({"result": "fail", "message": "사용자 없음"}), 400
    finally: conn.close()

@app.route('/api/lost/report', methods=['POST'])
def report_lost():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO lost_item (lounge_id, seat_num, item_name) VALUES (%s, %s, %s)", (d['loungeId'], d['seatId'], d['item']))
        conn.commit()
        return jsonify({"result": "success"})
    finally: conn.close()

@app.route('/api/admin/lost_items', methods=['POST'])
def get_lost_items():
    d = request.get_json()
    role = d.get('role')
    m_bid = d.get('managedBuildingId')
    
    conn = get_db()
    cur = conn.cursor()
    

    base_q = """
        SELECT l.id, l.found_date, 
               b.name as building, lg.name as lounge, 
               l.seat_num as seat_id, l.item_name as item 
        FROM lost_item l 
        JOIN lounge lg ON l.lounge_id=lg.id 
        JOIN building b ON lg.building_id=b.id
    """
    
    try:
        if role == 'admin':
            cur.execute(base_q + " ORDER BY l.found_date DESC")
        elif role == 'manager' and m_bid:
            cur.execute(base_q + " WHERE b.id = %s ORDER BY l.found_date DESC", (m_bid,))
        else:
            return jsonify([])

        items = cur.fetchall()
        
  
        result_list = []
        for i in items:
            found_date = i['found_date']
            result_list.append({
                'id': i['id'],
                'date': found_date.strftime("%Y-%m-%d"),
                'time': found_date.strftime("%H:%M"),  
                'building': i['building'],
                'lounge': i['lounge'],
                'seat_id': i['seat_id'],
                'item': i['item']
            })
            
        return jsonify(result_list)
    finally:
        conn.close()

@app.route('/api/admin/delete_lost_item', methods=['POST'])
def delete_lost_item():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM lost_item WHERE id=%s", (d['id'],))
    conn.commit()
    conn.close()
    return jsonify({"result": "success"})


@app.route('/api/admin/layout', methods=['POST'])
def save_layout():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    try:
        for i in d['layout']:
            cur.execute("UPDATE seat SET x=%s, y=%s WHERE lounge_id=%s AND seat_num=%s", (i['x'], i['y'], d['loungeId'], i['seatId']))
        conn.commit()
        return jsonify({"result": "success"})
    finally: conn.close()

@app.route('/api/admin/config', methods=['POST'])
def config_seats():
    d = request.get_json()
    lid, total = int(d['loungeId']), int(d['totalSeats'])
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM seat WHERE lounge_id=%s", (lid,))
    current = cur.fetchone()['cnt']
    if total > current:
        for i in range(current + 1, total + 1):
            cur.execute("INSERT INTO seat (lounge_id, seat_num, x, y) VALUES (%s, %s, 0, 0)", (lid, i))
    elif total < current:
        cur.execute("DELETE FROM seat WHERE lounge_id=%s AND seat_num > %s", (lid, total))
    conn.commit()
    conn.close()
    return jsonify({"result": "success"})

@app.route('/api/admin/power', methods=['POST'])
def toggle_power():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE seat SET has_power = NOT has_power WHERE lounge_id=%s AND seat_num=%s", (d['loungeId'], d['seatId']))
    conn.commit()
    conn.close()
    return jsonify({"result": "success"})

@app.route('/api/admin/add_building', methods=['POST'])
def add_building():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO building (id, name) VALUES (%s, %s)", (d['id'], d['name']))
        conn.commit()
        return jsonify({"result": "success"})
    except: return jsonify({"result": "fail"}), 500
    finally: conn.close()

@app.route('/api/admin/add_lounge', methods=['POST'])
def add_lounge():
    d = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO lounge (building_id, name) VALUES (%s, %s)", (d['buildingId'], d['name']))
    conn.commit()
    conn.close()
    return jsonify({"result": "success"})

if __name__ == '__main__':
    app.run(debug=True, port=5002)