const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.get('/', leadController.getLeads);
router.get('/export', leadController.exportLeads);
router.get('/:id', leadController.getLead);
router.patch('/:id/status', leadController.updateLeadStatus);
router.patch('/:id/assign', leadController.assignLead);
router.patch('/:id', leadController.updateLead);
router.post('/:id/notes', leadController.addNote);
router.delete('/:id/notes/:noteId', restrictTo('SUPER_ADMIN', 'ADMIN'), leadController.deleteNote);

module.exports = router;
