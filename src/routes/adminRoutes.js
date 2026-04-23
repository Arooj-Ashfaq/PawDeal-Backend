// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const {
    // User management
    getAllUsers,
    getUserDetails,
    updateUserStatus,
    
    // Seller verification
    getPendingSellers,
    verifySeller,
    
    // Content moderation
    getReportedContent,
    moderateContent,
    
    // Platform settings
    getSettings,
    updateSettings,
    
    // Reports & analytics
    getReports,
    exportData,
    
    // Audit logs
    getAuditLogs,
    
    // Backup management
    createBackup,
    getBackups,
    restoreBackup,
    
    // System health
    getSystemHealth,
    clearCache,
    toggleMaintenance
} = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// ========== DASHBOARD ==========
router.get('/dashboard', (req, res) => {
    res.redirect('/api/admin/reports');
});

// ========== USER MANAGEMENT ==========
router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetails);
router.patch('/users/:id/status', updateUserStatus);

// ========== SELLER VERIFICATION ==========
router.get('/sellers/pending', getPendingSellers);
router.post('/sellers/:id/verify', verifySeller);

// ========== CONTENT MODERATION ==========
router.get('/moderation/reported', getReportedContent);
router.post('/moderation/:type/:id', moderateContent);

// ========== PLATFORM SETTINGS ==========
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// ========== REPORTS & ANALYTICS ==========
router.get('/reports', getReports);
router.get('/export', exportData);

// ========== AUDIT LOGS ==========
router.get('/audit-logs', getAuditLogs);

// ========== BACKUP MANAGEMENT ==========
router.get('/backups', getBackups);
router.post('/backups', createBackup);
router.post('/backups/:id/restore', restoreBackup);

// ========== SYSTEM HEALTH ==========
router.get('/system/health', getSystemHealth);
router.post('/system/clear-cache', clearCache);
router.post('/system/maintenance', toggleMaintenance);

module.exports = router;