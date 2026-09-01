const Lead = require('../models/Lead');
const ConversationSession = require('../models/ConversationSession');

exports.getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalLeads,
      todayLeads,
      weekLeads,
      monthLeads,
      statusCounts,
      conversationStats,
    ] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ createdAt: { $gte: todayStart } }),
      Lead.countDocuments({ createdAt: { $gte: weekStart } }),
      Lead.countDocuments({ createdAt: { $gte: monthStart } }),
      Lead.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      ConversationSession.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap = {};
    for (const s of statusCounts) statusMap[s._id] = s.count;

    const convMap = {};
    for (const c of conversationStats) convMap[c._id] = c.count;

    res.json({
      success: true,
      data: {
        totalLeads,
        todayLeads,
        weekLeads,
        monthLeads,
        newLeads: statusMap['New'] || 0,
        contactedLeads: statusMap['Contacted'] || 0,
        qualifiedLeads: statusMap['Qualified'] || 0,
        wonLeads: statusMap['Won'] || 0,
        lostLeads: statusMap['Lost'] || 0,
        abandonedLeads: statusMap['Abandoned'] || 0,
        activeConversations: convMap['active'] || 0,
        completedConversations: convMap['completed'] || 0,
        abandonedConversations: convMap['abandoned'] || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getLeadsByService = async (req, res, next) => {
  try {
    const results = await Lead.aggregate([
      { $group: { _id: '$service', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);
    res.json({ success: true, data: results.map((r) => ({ service: r._id || 'Unknown', count: r.count })) });
  } catch (err) {
    next(err);
  }
};

exports.getLeadsByTeam = async (req, res, next) => {
  try {
    const results = await Lead.aggregate([
      { $group: { _id: '$assignedTeam', count: { $sum: 1 } } },
      { $lookup: { from: 'teams', localField: '_id', foreignField: '_id', as: 'team' } },
      { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
      { $project: { team: { $ifNull: ['$team.name', 'Unassigned'] }, count: 1 } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, data: results.map((r) => ({ team: r.team, count: r.count })) });
  } catch (err) {
    next(err);
  }
};

exports.getLeadsByDate = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = await Lead.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data: results.map((r) => ({ date: r._id, count: r.count })) });
  } catch (err) {
    next(err);
  }
};

exports.getRecentLeads = async (req, res, next) => {
  try {
    const leads = await Lead.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('assignedTeam', 'name color')
      .select('leadId name mobile service status createdAt assignedTeam')
      .lean();
    res.json({ success: true, data: leads });
  } catch (err) {
    next(err);
  }
};

exports.getRecentConversations = async (req, res, next) => {
  try {
    const sessions = await ConversationSession.find()
      .sort({ lastInteractionAt: -1 })
      .limit(10)
      .populate('user', 'whatsappNumber name')
      .select('whatsappNumber currentService status phase lastInteractionAt')
      .lean();
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
};