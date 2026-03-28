// ===== GOOGLE APPS SCRIPT (Paste di Editor Apps Script) =====

const SHEET_NAME = 'SafeTrack Reports';
const HEADER_ROW = 1;
const SPREADSHEET_ID = '1sq5leW45LVQjUzmojpadHKpu1RYFXymAg7LEuRpJDFM';

// ID folder Google Drive untuk menyimpan foto laporan
// Buat folder baru di Drive, lalu ambil ID-nya dari URL
// Contoh URL folder: https://drive.google.com/drive/folders/1ABC123xyz
// ID-nya adalah bagian setelah /folders/
const DRIVE_FOLDER_ID = '1kAwbL-HS81bIUTniyUVnXmiBAPI7UwSb';

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getDriveFolder() {
  try {
    // Pakai folder ID jika diisi
    if (DRIVE_FOLDER_ID && String(DRIVE_FOLDER_ID).trim() !== '') {
      const folder = DriveApp.getFolderById(String(DRIVE_FOLDER_ID).trim());
      try {
        folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        Logger.log('Warning setSharing folder: ' + shareErr.toString());
      }
      return folder;
    }

    // Fallback: cari / buat folder default
    const folders = DriveApp.getFoldersByName('SafeTrack Photos');
    if (folders.hasNext()) {
      const existing = folders.next();
      try {
        existing.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        Logger.log('Warning setSharing existing folder: ' + shareErr.toString());
      }
      return existing;
    }

    const newFolder = DriveApp.createFolder('SafeTrack Photos');
    try {
      newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log('Warning setSharing new folder: ' + shareErr.toString());
    }
    return newFolder;
  } catch (e) {
    Logger.log('Error getDriveFolder: ' + e.toString());
    return DriveApp.getRootFolder();
  }
}

// Inisialisasi sheet jika belum ada
function initializeSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME, 0);
    const headers = [
      'ID Backend',
      'Tanggal',
      'Tipe Laporan',
      'Kategori',
      'Pelapor',
      'Departemen',
      'Lokasi',
      'Status',
      'Prioritas',
      'Detail',
      'Deskripsi',
      'Tipe Box P3K',
      'Status Item P3K',
      'Catatan Admin',
      'Tanggal Selesai',
      'URL Foto',
      'Timestamp Sinkronisasi'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1e40af')
              .setFontColor('#ffffff')
              .setFontWeight('bold');
    
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(4, 120);
    sheet.setColumnWidth(5, 100);
    sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 150);
    sheet.setColumnWidth(8, 140);
    sheet.setColumnWidth(9, 100);
    sheet.setColumnWidth(10, 150);
    sheet.setColumnWidth(11, 200);
    sheet.setColumnWidth(12, 130);
    sheet.setColumnWidth(13, 200);
    sheet.setColumnWidth(14, 200);
    sheet.setColumnWidth(15, 120);
    sheet.setColumnWidth(16, 250); // URL Foto
    sheet.setColumnWidth(17, 150); // Timestamp
  }
  
  return sheet;
}

function createApiOutput(payload, callback) {
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(payload)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeTemplateName(value) {
  return (value || '').toString().replace(/[^a-z0-9-]/gi, '');
}

// Main handler untuk frontend (GET request)
function doGet(e) {
  try {
    const templateParam = sanitizeTemplateName(e && e.parameter ? e.parameter.template : '');

    // Serve fragment template menu: ?template=dashboard
    if (templateParam) {
      return HtmlService
        .createHtmlOutputFromFile(`pages/${templateParam}`)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Serve halaman utama SPA
    return HtmlService
      .createHtmlOutputFromFile('safetrack')
      .setTitle('SafeTrack - K3 Reporting System')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    Logger.log('Error di doGet: ' + error.toString());
    return HtmlService
      .createHtmlOutput(`<pre>Gagal memuat frontend: ${error.toString()}</pre>`)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

// ===== UPLOAD FOTO KE GOOGLE DRIVE =====
function uploadPhotoToDrive(base64Data, fileName, mimeType) {
  try {
    if (!base64Data) throw new Error('base64Data kosong');

    const safeName = (fileName || 'photo.jpg').toString().replace(/[^\w.\-]/g, '_');
    const safeMime = (mimeType || 'image/jpeg').toString();

    // Hapus prefix data URL jika ada
    const base64Clean = String(base64Data).replace(/^data:[^;]+;base64,/, '');
    const bytes = Utilities.base64Decode(base64Clean);
    const blob = Utilities.newBlob(bytes, safeMime, safeName);

    const folder = getDriveFolder();
    const file = folder.createFile(blob);

    // Upayakan agar dapat diakses publik via link (kalau policy mengizinkan)
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log('Warning setSharing file: ' + shareErr.toString());
      // Tetap lanjutkan; file tetap tersimpan
    }

    const fileId = file.getId();
    return {
      success: true,
      fileId: fileId,
      name: file.getName(),
      mimeType: file.getMimeType(),
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
      directUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`
    };
  } catch (error) {
    Logger.log('Error uploadPhotoToDrive: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// Main handler untuk POST request
function doPost(e) {
  try {
    const sheet = initializeSheet();
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(rawBody);

    // ===== ACTION: Upload Foto =====
    if (data.action === 'uploadPhoto') {
      if (!data.base64 || !data.fileName) {
        return createApiOutput({ status: 'error', message: 'Data foto tidak lengkap' });
      }

      // Opsional: validasi ukuran file jika frontend mengirimkan `size` (bytes)
      if (typeof data.size !== 'undefined' && data.size !== null && data.size !== '') {
        const sizeNum = Number(data.size);
        const maxBytes = 2 * 1024 * 1024; // 2MB
        if (!Number.isFinite(sizeNum) || sizeNum < 0) {
          return createApiOutput({ status: 'error', message: 'Nilai size tidak valid' });
        }
        if (sizeNum > maxBytes) {
          return createApiOutput({ status: 'error', message: 'Ukuran file melebihi batas 2MB' });
        }
      }
      
      const result = uploadPhotoToDrive(
        data.base64,
        data.fileName,
        data.mimeType || 'image/jpeg'
      );
      
      if (result.success) {
        return createApiOutput({
          status: 'success',
          fileId: result.fileId,
          viewUrl: result.viewUrl,
          directUrl: result.directUrl
        });
      } else {
        return createApiOutput({ status: 'error', message: result.error });
      }
    }

    // ===== ACTION: Delete Report =====
    if (data.action === 'deleteReport' && data.backendId) {
      const deleted = deleteReportById(sheet, data.backendId);
      return createApiOutput({
        status: deleted ? 'success' : 'error',
        message: deleted ? 'Laporan berhasil dihapus dari spreadsheet' : 'Laporan tidak ditemukan di spreadsheet'
      });
    }
    
    // ===== ACTION: Sync All Reports =====
    if (data.action === 'syncAll' && data.reports && Array.isArray(data.reports)) {
      syncAllReports(sheet, data.reports);
      return createApiOutput({ status: 'success', message: `${data.reports.length} laporan tersinkronisasi` });
    }
    
    return createApiOutput({ status: 'error', message: 'Action tidak dikenali' });
    
  } catch (error) {
    Logger.log('Error di doPost: ' + error.toString());
    return createApiOutput({ status: 'error', message: error.toString() });
  }
}

function formatServerDateTime(value) {
  if (!value) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function syncAllReports(sheet, reports) {
  if (!reports || reports.length === 0) return;
  
  const existingData = sheet.getDataRange().getValues();
  const newReports = [];
  const updateIndices = [];
  
  reports.forEach(report => {
    const rowIndex = existingData.findIndex(row => row[0] === report.backendId);
    if (rowIndex === -1) {
      newReports.push(report);
    } else {
      updateIndices.push({ report, rowIndex: rowIndex + 1 });
    }
  });
  
  if (newReports.length > 0) {
    const newRows = newReports.map(r => [
      r.backendId,
      formatServerDateTime(r.date),
      r.type,
      r.category,
      r.reporter,
      r.department,
      r.location,
      r.status,
      r.priority,
      r.details,
      r.description,
      r.boxType,
      r.itemsStatus,
      r.adminNotes,
      r.completedDate,
      Array.isArray(r.photoUrls) ? r.photoUrls.join('\n') : (r.photoUrls || ''),
      new Date().toLocaleString('id-ID')
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 17).setValues(newRows);
  }
  
  updateIndices.forEach(({ report, rowIndex }) => {
    const values = [
      report.backendId,
      formatServerDateTime(report.date),
      report.type,
      report.category,
      report.reporter,
      report.department,
      report.location,
      report.status,
      report.priority,
      report.details,
      report.description,
      report.boxType,
      report.itemsStatus,
      report.adminNotes,
      report.completedDate,
      Array.isArray(report.photoUrls) ? report.photoUrls.join('\n') : (report.photoUrls || ''),
      new Date().toLocaleString('id-ID')
    ];
    sheet.getRange(rowIndex, 1, 1, 17).setValues([values]);
  });
  
  removeDuplicates(sheet);
}

function removeDuplicates(sheet) {
  const data = sheet.getDataRange().getValues();
  const seen = new Set();
  const rowsToDelete = [];
  
  for (let i = data.length - 1; i > 0; i--) {
    const id = data[i][0];
    if (seen.has(id)) {
      rowsToDelete.push(i + 1);
    } else {
      seen.add(id);
    }
  }
  
  rowsToDelete.forEach(row => {
    sheet.deleteRow(row);
  });
}

function deleteReportById(sheet, backendId) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i > 0; i--) {
    if (data[i][0] === backendId) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function doGet(e) {
  try {
    const sheet = initializeSheet();
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : "summary";
    const callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : "";

    if (action === "getReports") {
      const data = sheet.getDataRange().getValues();
      const reports = data.slice(1).map(row => ({
        __backendId: row[0] || "",
        report_date: row[1] || "",
        type: row[2] || "",
        category: row[3] || "",
        reporter_name: row[4] || "",
        department: row[5] || "",
        location: row[6] || "",
        status: row[7] || "",
        priority: row[8] || "Normal",
        details: row[9] || "",
        description: row[10] || "",
        box_type: row[11] || "",
        items_status: row[12] || "",
        admin_notes: row[13] || "",
        completed_date: row[14] || "",
        photo_urls: row[15] ? String(row[15]).split('\n').filter(Boolean) : [],
        synced_at: row[16] || ""
      }));

      return createApiOutput({ status: "success", reports, total: reports.length }, callback);
    }

    const total = Math.max(sheet.getLastRow() - HEADER_ROW, 0);
    return createApiOutput({ status: "success", total }, callback);
  } catch (error) {
    Logger.log("Error di doGet: " + error.toString());
    const callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : "";
    return createApiOutput({ status: "error", message: error.toString() }, callback);
  }
}

// Test fungsi upload
function testUpload() {
  // Test membuat folder dan upload file kecil
  const folder = getDriveFolder();
  Logger.log('Folder name: ' + folder.getName());
  Logger.log('Folder ID: ' + folder.getId());
  Logger.log('Test berhasil!');
}

function testSync() {
  const sheet = initializeSheet();
  const testData = {
    action: 'syncAll',
    reports: [
      {
        backendId: 'test-001',
        date: '2024-01-15',
        type: 'Inspeksi APAR',
        category: 'Powder',
        reporter: 'Budi Santoso',
        department: 'Dyeing',
        location: 'Lantai 2 Area Produksi',
        status: 'Selesai',
        priority: 'Normal',
        details: 'APAR-001, Exp: 2025-06-30',
        description: 'Semua checklist baik',
        boxType: '',
        itemsStatus: '',
        adminNotes: '',
        completedDate: '2024-01-15',
        photoUrls: []
      }
    ]
  };
  syncAllReports(sheet, testData.reports);
  Logger.log('Test sync berhasil!');
}