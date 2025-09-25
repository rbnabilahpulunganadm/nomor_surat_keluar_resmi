/**
 * =================================================================================
 * SISTEM PENOMORAN SURAT KLINIK CERDAS V2.1 - GOOGLE APPS SCRIPT BACKEND
 * =================================================================================
 * * PERBAIKAN:
 * 1. Menambahkan kolom terpisah untuk data detail (tidak hanya JSON)
 * 2. Menambahkan jenis surat baru: Surat Keterangan Lahir (SKL)
 * 3. Optimasi struktur database
 * * =================================================================================
 */

// --- KONFIGURASI ---
const SHEET_NAME = 'Database Surat';
const CLINIC_CODE = 'KNP'; // Kode untuk Klinik Nabilah Pulungan

// HEADER BARU: Kolom terpisah untuk data detail + JSON backup
const HEADERS = [
  'ID', 'Nomor Surat', 'Jenis Surat (Kode)', 'Nama Pasien', 
  'Tanggal Surat', 'Detail Data (JSON)', 'Tanggal Dibuat',
  // Kolom tambahan untuk data detail yang sering digunakan
  'Usia', 'Jenis Kelamin', 'Alamat', 'Pekerjaan', 'Tujuan Surat',
  'Tanggal Lahir', 'Berat Badan', 'Tinggi Badan', 'Tekanan Darah',
  // Khusus Surat Lahir
  'Nama Bayi', 'Nama Ibu', 'Umur Ibu', 'Nama Ayah', 'Jam Lahir',
  'Jenis Kelahiran', 'Kelahiran Ke', 'No HP'
];

// Map untuk mengubah kode jenis surat menjadi teks yang mudah dibaca
const LETTER_TYPE_MAP = {
  'SKS': 'Surat Keterangan Sehat',
  'SKT': 'Surat Keterangan Sakit',
  'SKH': 'Surat Keterangan Hamil',
  'SKB': 'Surat Keterangan Bersalin',
  'SKL': 'Surat Keterangan Lahir', // BARU
  'SKK': 'Surat Keterangan Kerja',
  'SKBK': 'Surat Keterangan Berhenti Bekerja',
  'SR': 'Surat Rujukan',
  'SL': 'Lainnya'
};

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Sistem Penomoran Surat Klinik Cerdas')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    let response;

    switch (request.action) {
      case 'get':
        response = getHistory();
        break;
      case 'add':
        response = addNewLetter(request.payload);
        break;
      default:
        throw new Error('Aksi tidak valid');
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: response }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheetAndSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange("F:F").setNumberFormat('@'); // Set kolom JSON ke format Teks
  } else {
    // Periksa dan update header jika diperlukan
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    const currentHeaders = headerRange.getValues()[0];
    if (currentHeaders.join() !== HEADERS.join()) {
      // Backup data existing sebelum update header
      const dataRange = sheet.getRange(2, 1, sheet.getLastRow()-1, currentHeaders.length);
      const existingData = dataRange.getValues();
      
      // Clear sheet dan set header baru
      sheet.clear();
      headerRange.setValues([HEADERS]);
      headerRange.setFontWeight('bold');
      
      // Kembalikan data yang ada (hanya kolom yang match)
      if (existingData.length > 0) {
        const newData = existingData.map(row => {
          const newRow = new Array(HEADERS.length).fill('');
          for (let i = 0; i < Math.min(currentHeaders.length, HEADERS.length); i++) {
            if (HEADERS.includes(currentHeaders[i])) {
              const newIndex = HEADERS.indexOf(currentHeaders[i]);
              newRow[newIndex] = row[i];
            }
          }
          return newRow;
        });
        if (newData.length > 0) {
          sheet.getRange(2, 1, newData.length, HEADERS.length).setValues(newData);
        }
      }
      Logger.log('Header diperbarui ke versi baru.');
    }
  }
  return sheet;
}

function getHistory() {
  const sheet = getSheetAndSetup();
  if (sheet.getLastRow() <= 1) return [];

  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length);
  const values = range.getValues();

  const history = values.map((row, index) => {
    const [id, nomorSurat, jenisSurat, namaPasien, tanggalSurat, detailData] = row;
    const validDate = tanggalSurat && new Date(tanggalSurat).getTime();
    return {
      id: index + 2,
      nomorSurat,
      jenisSurat: jenisSurat,
      jenisSuratText: LETTER_TYPE_MAP[jenisSurat] || 'Tidak Diketahui',
      namaPasien,
      tanggalSurat: validDate ? new Date(tanggalSurat).toISOString().split('T')[0] : '',
      tanggalSuratFormatted: validDate ? new Date(tanggalSurat).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A',
      detailData: detailData
    };
  }).reverse(); 

  return history;
}

function addNewLetter(payload) {
  const { letterType, patientName, letterDate, detailData } = payload;
  const sheet = getSheetAndSetup();
  
  // Menghitung nomor urut berikutnya dari baris terakhir
  const nextId = sheet.getLastRow();

  const dateForNumbering = new Date(letterDate);
  const monthRoman = toRoman(dateForNumbering.getMonth() + 1);
  const year = dateForNumbering.getFullYear();
  const paddedId = String(nextId).padStart(3, '0');
  const newLetterNumber = `${paddedId}/${letterType.toUpperCase()}/${CLINIC_CODE}/${monthRoman}/${year}`;

  // Parse detailData untuk mengisi kolom terpisah
  let detailObj = {};
  try {
    detailObj = JSON.parse(detailData);
  } catch (e) {
    detailObj = {};
  }

  // Siapkan row dengan kolom tambahan
  const newRow = new Array(HEADERS.length).fill('');
  
  // Isi kolom dasar
  newRow[0] = nextId; // ID
  newRow[1] = newLetterNumber; // Nomor Surat
  newRow[2] = letterType.toUpperCase(); // Jenis Surat
  newRow[3] = patientName; // Nama Pasien
  newRow[4] = new Date(letterDate); // Tanggal Surat
  newRow[5] = detailData; // JSON backup
  newRow[6] = new Date(); // Tanggal Dibuat
  
  // Isi kolom tambahan dari detailData
  const fieldMapping = {
    'usia': 7, 'jenis_kelamin': 8, 'alamat': 9, 'pekerjaan': 10, 'tujuan': 11,
    'tgl_lahir': 12, 'bb': 13, 'tb': 14, 'tensi': 15,
    'nama_bayi': 16, 'nama_ibu': 17, 'umur_ibu': 18, 'nama_ayah': 19, 'jam_lahir': 20,
    'jenis_kelahiran': 21, 'kelahiran_ke': 22, 'no_hp': 23
  };
  
  for (const [field, colIndex] of Object.entries(fieldMapping)) {
    if (detailObj[field] !== undefined) {
      newRow[colIndex] = detailObj[field];
    }
  }
  
  sheet.appendRow(newRow);
  SpreadsheetApp.flush();
  
  return { message: 'Surat berhasil ditambahkan', nomorSurat: newLetterNumber };
}

function toRoman(num) {
  const roman = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII' };
  return roman[num] || num;
}