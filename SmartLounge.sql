SET FOREIGN_KEY_CHECKS = 0;
DROP DATABASE IF EXISTS SmartLounge;
CREATE DATABASE SmartLounge;
USE SmartLounge;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. 건물
CREATE TABLE building (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

-- 2. 사용자 (기본 정보 - 슈퍼타입)
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    pw VARCHAR(100) NOT NULL,
    name VARCHAR(50) NOT NULL,
    role ENUM('admin', 'manager', 'user') DEFAULT 'user'
);

-- 3. 학생 상세 정보 (서브타입)
CREATE TABLE students (
    user_id VARCHAR(50) PRIMARY KEY,
    student_num VARCHAR(20) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. 매니저 상세 정보 (서브타입)
CREATE TABLE managers (
    user_id VARCHAR(50) PRIMARY KEY,
    building_id VARCHAR(10) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES building(id) ON DELETE CASCADE
);

-- 5. 라운지
CREATE TABLE lounge (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building_id VARCHAR(10),
    name VARCHAR(50) NOT NULL,
    FOREIGN KEY (building_id) REFERENCES building(id) ON DELETE CASCADE
);

-- 6. 벌점
CREATE TABLE penalty (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50),
    reason VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. 좌석
CREATE TABLE seat (
    lounge_id INT NOT NULL,
    seat_num INT NOT NULL,
    x INT DEFAULT 0,
    y INT DEFAULT 0,
    has_power BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (lounge_id) REFERENCES lounge(id) ON DELETE CASCADE
);

-- 8. 예약
CREATE TABLE reservation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50),
    seat_id INT,
    lounge_id INT,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seat_id) REFERENCES seat(id) ON DELETE CASCADE
);

-- 9. 분실물
CREATE TABLE lost_item (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lounge_id INT,
    seat_num INT,
    item_name VARCHAR(255),
    found_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lounge_id) REFERENCES lounge(id) ON DELETE CASCADE
);

INSERT INTO users (id, pw, name, role) VALUES ('admin', '1234', '총관리자', 'admin');