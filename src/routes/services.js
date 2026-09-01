const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.get('/', serviceController.getServices);
router.get('/:id', serviceController.getService);
router.post('/', restrictTo('SUPER_ADMIN', 'ADMIN'), serviceController.createService);
router.patch('/:id', restrictTo('SUPER_ADMIN', 'ADMIN'), serviceController.updateService);
router.patch('/:id/reorder', restrictTo('SUPER_ADMIN', 'ADMIN'), serviceController.reorderService);

// Flow management
router.post('/:id/flows', restrictTo('SUPER_ADMIN', 'ADMIN'), serviceController.createFlow);
router.patch('/:id/flows/:flowVersion/questions', restrictTo('SUPER_ADMIN', 'ADMIN'), serviceController.updateQuestions);

module.exports = router;
