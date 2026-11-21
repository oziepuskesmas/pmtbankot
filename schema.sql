-- ====================================================================
-- SCHEMA DATABASE PMT PUSKESMAS BANJARAN KOTA (CLOUDFLARE D1 DATABASE)
-- Database: pmt_database
-- ====================================================================

-- 1. TABEL PENGGUNA (AKUN PEGAWAI)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Petugas',
    puskesmas VARCHAR(100) DEFAULT 'Puskesmas Banjaran Kota',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Akun Admin Utama
INSERT OR IGNORE INTO users (username, password, role, puskesmas) VALUES 
('Mochamad Fauzie, S.Gz', '213117', 'Admin', 'Puskesmas Banjaran Kota');

-- 2. TABEL DOKUMEN KEGIATAN PMT
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(100) PRIMARY KEY,
    desa VARCHAR(100) NOT NULL,
    termin VARCHAR(50) NOT NULL,
    puskesmas VARCHAR(100) DEFAULT 'Puskesmas Banjaran Kota',
    tanggal_custom VARCHAR(100),
    judul VARCHAR(255),
    sub_judul VARCHAR(255),
    fotos_json TEXT,
    created_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
