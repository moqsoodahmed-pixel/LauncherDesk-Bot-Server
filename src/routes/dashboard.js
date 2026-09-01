const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/stats', dashboardController.getStats);
router.get('/leads-by-service', dashboardController.getLeadsByService);
router.get('/leads-by-team', dashboardController.getLeadsByTeam);
router.get('/leads-by-date', dashboardController.getLeadsByDate);
router.get('/recent-leads', dashboardController.getRecentLeads);
router.get('/recent-conversations', dashboardController.getRecentConversations);

module.exports = router;
