/**
 * LauncherDesk WhatsApp Conversation Engine
 *
 * A state-machine style engine that drives the WhatsApp bot conversation.
 * All flow configuration is loaded from MongoDB — no flows are hardcoded here.
 *
 * Flow:
 *  1. User sends first message → showServiceMenu()
 *  2. User picks service → startServiceFlow()
 *  3. Engine asks questions one at a time → askQuestion()
 *  4. User answers → processAnswer()
 *  5. After all questions → showSummary()
 *  6. User confirms → submitLead()
 *  7. Success message → completeConversation()
 */

const ServiceCategory = require('../models/ServiceCategory');
const ConversationSession = require('../models/ConversationSession');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Team = require('../models/Team');
const MessageLog = require('../models/MessageLog');
const msg91 = require('../services/msg91Service');
const { validateIndianMobile, normalizeIndianMobile, fromWhatsAppNumber } = require('../validators/mobileValidator');
const logger = require('../utils/logger');

// Global command keywords
const MENU_COMMANDS = ['menu', 'start', 'services', 'home', 'back to menu', '0'];
const BACK_COMMANDS = ['back', 'prev', 'previous', 'go back'];
const SKIP_COMMANDS = ['skip', 'next', 'pass', 'optional'];
const START_COMMANDS = ['start over', 'restart', 'reset', 'begin again'];
const DONE_COMMANDS = ['done', 'continue', 'next', 'proceed', 'submit'];

/**
 * Main entry point. Called for every incoming WhatsApp message.
 */
async function processMessage(incomingMessage) {
  const { fromNumber, messageText, buttonPayload, messageType } = incomingMessage;
  const text = (messageText || '').trim();
  const buttonValue = buttonPayload?.title || buttonPayload?.id || '';

  // Normalize the user's WhatsApp number
  const normalizedFrom = normalizeWhatsAppNumber(fromNumber);

  // Find or create user
  const user = await findOrCreateUser(normalizedFrom, fromNumber);

  // Find active session or create new one
  let session = await ConversationSession.findOne({
    whatsappNumber: normalizedFrom,
    status: { $in: ['active', 'awaiting_menu'] },
  }).sort({ createdAt: -1 });

  // Log incoming message
  if (session) {
    session.messages.push({
      direction: 'incoming',
      messageType,
      content: text || buttonValue,
      payload: { text, buttonPayload },
      externalMessageId: incomingMessage.messageId,
      timestamp: incomingMessage.timestamp,
    });
  }

  // Check for global commands first
  const lowerText = (text || buttonValue || '').toLowerCase().trim();

  if (MENU_COMMANDS.includes(lowerText) || lowerText === 'menu') {
    if (session) {
      session.phase = 'menu';
      session.status = 'awaiting_menu';
      session.currentService = null;
      session.currentQuestionIndex = -1;
      await session.save();
    }
    return showServiceMenu(normalizedFrom, session?._id);
  }

  if (START_COMMANDS.includes(lowerText)) {
    if (session) {
      session.status = 'abandoned';
      session.phase = 'menu';
      await session.save();
      session = null;
    }
    return showServiceMenu(normalizedFrom);
  }

  // No active session or session at menu phase → show menu or process menu selection
  if (!session || session.phase === 'menu' || session.status === 'awaiting_menu') {
    if (!session) {
      session = await ConversationSession.create({
        user: user._id,
        whatsappNumber: normalizedFrom,
        status: 'awaiting_menu',
        phase: 'menu',
        lastInteractionAt: new Date(),
      });
      session._isNew = true; // mark so we know to send the menu
    }

    session.lastInteractionAt = new Date();

    // Try to match a service from text/button
    const serviceMatch = await matchService(text || buttonValue);
    if (serviceMatch) {
      await session.save();
      return startServiceFlow(session, user, serviceMatch, normalizedFrom);
    }

    // Unknown input on menu — only send menu if session was just created
    // (isNew flag set below) or if user explicitly typed a menu command.
    // This prevents duplicate menus when MSG91 fires the same webhook twice.
    await session.save();
    if (session._isNew || MENU_COMMANDS.includes(lowerText)) {
      return showServiceMenu(normalizedFrom, session._id);
    }
    // Duplicate webhook — silently ignore
    logger.debug('[Engine] Suppressing duplicate menu send', { number: normalizedFrom });
    return;
  }

  // Update last interaction
  session.lastInteractionAt = new Date();

  // Route by current phase
  if (session.phase === 'flow') {
    if (BACK_COMMANDS.includes(lowerText) && session.currentQuestionIndex > 0) {
      return goBack(session, normalizedFrom);
    }
    return handleFlowInput(session, user, text, buttonValue, incomingMessage, normalizedFrom);
  }

  if (session.phase === 'summary') {
    return handleSummaryInput(session, user, text, buttonValue, normalizedFrom);
  }

  if (session.phase === 'edit') {
    return handleEditInput(session, user, text, buttonValue, normalizedFrom);
  }

  // Fallback
  await session.save();
  return showServiceMenu(normalizedFrom, session._id);
}

// ─────────────────────────────────────────────────────────────
// Service Menu
// ─────────────────────────────────────────────────────────────

async function showServiceMenu(toNumber, conversationId) {
  const categories = await ServiceCategory.find({ isActive: true }).sort({ order: 1 }).select('name slug icon order');

  const welcomeText =
    '👋 *Welcome to LauncherDesk!* We\'re here to help you start, manage and grow your business. Please choose a service below.';

  const options = categories.map((cat, i) => ({
    id: cat.slug,
    label: `${cat.icon || ''} ${cat.name}`.trim(),
    value: cat.slug,
  }));

  // WhatsApp lists support up to 10 items per section
  // If > 10, split into sections
  if (options.length <= 10) {
    await msg91.sendListMessage(
      toNumber,
      welcomeText,
      options,
      'Our Services',
      conversationId
    );
  } else {
    // Split into sections of 10
    const sections = [];
    for (let i = 0; i < options.length; i += 10) {
      sections.push({
        title: i === 0 ? 'Services (1)' : `Services (${Math.floor(i / 10) + 1})`,
        rows: options.slice(i, i + 10).map((opt) => ({
          id: opt.id,
          title: opt.label.slice(0, 24),
        })),
      });
    }
    await msg91.sendMessage(
      toNumber,
      { type: 'list', body: welcomeText, sections, buttonLabel: 'Select Service' },
      conversationId
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Service Matching
// ─────────────────────────────────────────────────────────────

async function matchService(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();

  // Exact or near-exact match on slug or name
  const categories = await ServiceCategory.find({ isActive: true }).select('name slug');
  for (const cat of categories) {
    if (
      lower === cat.slug ||
      lower === cat.name.toLowerCase() ||
      lower.includes(cat.slug) ||
      cat.name.toLowerCase().includes(lower)
    ) {
      return cat;
    }
  }

  // Keyword map for common freetext inputs
  const keywordMap = {
    'business registration': 'business-registration',
    'register': 'business-registration',
    'company': 'business-registration',
    'pvt ltd': 'business-registration',
    'private limited': 'business-registration',
    'llp': 'business-registration',
    'opc': 'business-registration',
    'gst': 'licenses-certifications',
    'msme': 'licenses-certifications',
    'fssai': 'licenses-certifications',
    'license': 'licenses-certifications',
    'certification': 'licenses-certifications',
    'trademark': 'ipr-trademark',
    'ipr': 'ipr-trademark',
    'patent': 'ipr-trademark',
    'website': 'it-services',
    'app': 'it-services',
    'mobile app': 'it-services',
    'digital marketing': 'it-services',
    'crm': 'marketplace-software',
    'erp': 'marketplace-software',
    'software': 'marketplace-software',
    'finance': 'finance-accounts',
    'tax': 'finance-accounts',
    'itr': 'finance-accounts',
    'accounting': 'finance-accounts',
    'legal': 'legal-compliance',
    'compliance': 'legal-compliance',
    'international': 'international-expansion',
    'dubai': 'international-expansion',
    'uae': 'international-expansion',
    'office setup': 'office-setup',
    'furniture': 'office-setup',
    'co-working': 'office-space',
    'coworking': 'office-space',
    'private office': 'office-space',
    'virtual office': 'virtual-office',
    'stamp': 'e-stamp',
    'expert': 'talk-to-expert',
    'call me': 'talk-to-expert',
    'help': 'talk-to-expert',
  };

  for (const [keyword, slug] of Object.entries(keywordMap)) {
    if (lower.includes(keyword)) {
      const cat = categories.find((c) => c.slug === slug);
      if (cat) return cat;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Start a Service Flow
// ─────────────────────────────────────────────────────────────

async function startServiceFlow(session, user, serviceCategory, toNumber) {
  const fullCategory = await ServiceCategory.findById(serviceCategory._id);
  if (!fullCategory) {
    return sendTextMessage(toNumber, '❌ Service not found. Please choose from the menu below.', session._id);
  }

  const flow = fullCategory.getActiveFlow();
  if (!flow || !flow.questions || flow.questions.length === 0) {
    logger.error(`No active flow found for service: ${fullCategory.slug}`);
    return sendTextMessage(toNumber, '⚠️ This service is temporarily unavailable. Please try another or talk to an expert.', session._id);
  }

  // Snapshot the flow for versioning stability
  session.flowSnapshot = JSON.parse(JSON.stringify(flow.toObject ? flow.toObject() : flow));
  session.currentService = fullCategory.name;
  session.currentServiceSlug = fullCategory.slug;
  session.currentServiceId = fullCategory._id;
  session.currentFlowVersion = flow.version;
  session.currentQuestionIndex = 0;
  session.answers = {};
  session.phase = 'flow';
  session.status = 'active';
  session.isEditing = false;
  session.invalidMobileAttempts = 0;
  await session.save();

  return askQuestion(session, toNumber, 0);
}

// ─────────────────────────────────────────────────────────────
// Ask a Question
// ─────────────────────────────────────────────────────────────

async function askQuestion(session, toNumber, questionIndex) {
  const flow = session.flowSnapshot;
  if (!flow || !flow.questions) {
    return showServiceMenu(toNumber, session._id);
  }

  const questions = flow.questions.filter((q) => q.isActive !== false).sort((a, b) => a.index - b.index);
  const question = questions[questionIndex];

  if (!question) {
    // All questions answered → show summary
    return showSummary(session, toNumber);
  }

  const total = questions.length;
  const stepNum = questionIndex + 1;
  const progressLine = `_Step ${stepNum} of ${total}_\n\n`;
  const optionalNote = question.isOptional ? '\n_(Optional — tap Skip)_' : '';
  const questionText = `${progressLine}${question.question}${optionalNote}`;

  switch (question.inputType) {
    case 'BUTTONS': {
      const activeOptions = (question.options || []).filter((o) => o.isActive !== false).sort((a, b) => a.order - b.order);
      const buttons = activeOptions.map((opt) => ({ id: opt.value, label: opt.label }));
      if (question.isOptional) {
        buttons.push({ id: '_skip', label: 'Skip' });
      }
      // Always show BACK on questions after first
      if (questionIndex > 0) {
        // Note: Can't add back as interactive button if already 3; use text fallback
        if (buttons.length < 3) buttons.push({ id: '_back', label: '◀ Back' });
      }
      return msg91.sendButtonMessage(toNumber, questionText, buttons, session._id);
    }

    case 'LIST': {
      const activeOptions = (question.options || []).filter((o) => o.isActive !== false).sort((a, b) => a.order - b.order);
      const options = activeOptions.map((opt) => ({ id: opt.value, label: opt.label }));
      if (question.isOptional) options.push({ id: '_skip', label: 'Skip' });
      return msg91.sendListMessage(toNumber, questionText, options, 'Choose one', session._id);
    }

    case 'MULTI_SELECT': {
      const activeOptions = (question.options || []).filter((o) => o.isActive !== false).sort((a, b) => a.order - b.order);
      session.multiSelectAnswers = [];
      session.awaitingMultiSelectDone = true;
      await session.save();

      const buttons = activeOptions.map((opt) => ({ id: opt.value, label: opt.label }));
      buttons.push({ id: '_done', label: '✅ Done' });
      if (question.isOptional) buttons.push({ id: '_skip', label: 'Skip' });

      const multiText = `${questionText}\n\n_Select all that apply, then tap Done._`;
      return msg91.sendButtonMessage(toNumber, multiText, buttons, session._id);
    }

    case 'TEXT':
    case 'MOBILE': {
      const extraHint = question.inputType === 'MOBILE' ? '\n_(Enter your 10-digit mobile number)_' : '';
      return msg91.sendTextMessage(toNumber, `${questionText}${extraHint}`, session._id);
    }

    default:
      return msg91.sendTextMessage(toNumber, questionText, session._id);
  }
}

// ─────────────────────────────────────────────────────────────
// Handle Flow Input (user answer)
// ─────────────────────────────────────────────────────────────

async function handleFlowInput(session, user, text, buttonValue, incomingMessage, toNumber) {
  const flow = session.flowSnapshot;
  const questions = flow.questions.filter((q) => q.isActive !== false).sort((a, b) => a.index - b.index);
  const qi = session.currentQuestionIndex;
  const question = questions[qi];

  if (!question) {
    return showSummary(session, toNumber);
  }

  const input = (buttonValue || text || '').trim();
  const inputLower = input.toLowerCase();

  // Back command
  if (BACK_COMMANDS.includes(inputLower) || input === '_back') {
    return goBack(session, toNumber);
  }

  // Menu command
  if (MENU_COMMANDS.includes(inputLower)) {
    session.phase = 'menu';
    session.status = 'awaiting_menu';
    await session.save();
    return showServiceMenu(toNumber, session._id);
  }

  // Multi-select handling
  if (session.awaitingMultiSelectDone && question.inputType === 'MULTI_SELECT') {
    return handleMultiSelectInput(session, question, input, questions, toNumber);
  }

  // Skip command for optional questions
  if ((SKIP_COMMANDS.includes(inputLower) || input === '_skip') && question.isOptional) {
    session.answers[question.key] = null;
    session.currentQuestionIndex = qi + 1;
    await session.save();
    return askQuestion(session, toNumber, qi + 1);
  }

  // Skip for required questions — gentle rejection
  if (SKIP_COMMANDS.includes(inputLower) && !question.isOptional) {
    await msg91.sendTextMessage(toNumber, '⚠️ This field is required. Please provide an answer to continue.', session._id);
    return askQuestion(session, toNumber, qi);
  }

  // Validate answer based on type
  const validation = validateAnswer(question, input);
  if (!validation.valid) {
    // Mobile-specific retry logic
    if (question.inputType === 'MOBILE') {
      session.invalidMobileAttempts = (session.invalidMobileAttempts || 0) + 1;
      await session.save();

      if (session.invalidMobileAttempts >= 2) {
        // Offer Talk to Expert
        await msg91.sendButtonMessage(
          toNumber,
          `⚠️ We still couldn\'t validate the mobile number. Would you like us to connect you to an expert instead?`,
          [
            { id: 'talk-to-expert', label: '📞 Talk to an Expert' },
            { id: '_retry_mobile', label: '🔄 Try Again' },
          ],
          session._id
        );
        return;
      }

      await msg91.sendTextMessage(toNumber, `❌ ${validation.error}\n\nPlease enter a valid 10-digit Indian mobile number (e.g., 9876543210).`, session._id);
      return;
    }

    await msg91.sendTextMessage(toNumber, `❌ ${validation.error}`, session._id);
    return askQuestion(session, toNumber, qi);
  }

  // Reset mobile attempt counter on success
  if (question.inputType === 'MOBILE') {
    session.invalidMobileAttempts = 0;
  }

  // Store the answer
  const storedValue = validation.normalized || input;
  session.answers[question.key] = {
    value: storedValue,
    displayValue: getDisplayValue(question, input, storedValue),
    label: question.fieldLabel || question.question,
    inputType: question.inputType,
    answeredAt: new Date(),
  };

  // Advance to next question
  const nextIndex = qi + 1;
  session.currentQuestionIndex = nextIndex;
  session.invalidAttemptCount = 0;
  await session.save();

  if (nextIndex >= questions.length) {
    return showSummary(session, toNumber);
  }

  return askQuestion(session, toNumber, nextIndex);
}

// ─────────────────────────────────────────────────────────────
// Multi-Select Handler
// ─────────────────────────────────────────────────────────────

async function handleMultiSelectInput(session, question, input, questions, toNumber) {
  const qi = session.currentQuestionIndex;
  const activeOptions = question.options.filter((o) => o.isActive !== false);

  if (input === '_done' || DONE_COMMANDS.includes(input.toLowerCase())) {
    // Finalize multi-select
    session.awaitingMultiSelectDone = false;
    const selected = session.multiSelectAnswers || [];
    session.answers[question.key] = {
      value: selected,
      displayValue: selected.length > 0 ? selected.join(', ') : 'None',
      label: question.fieldLabel || question.question,
      inputType: 'MULTI_SELECT',
      answeredAt: new Date(),
    };
    session.multiSelectAnswers = [];
    const nextIndex = qi + 1;
    session.currentQuestionIndex = nextIndex;
    await session.save();

    if (nextIndex >= questions.length) {
      return showSummary(session, toNumber);
    }
    return askQuestion(session, toNumber, nextIndex);
  }

  if (input === '_skip' && question.isOptional) {
    session.awaitingMultiSelectDone = false;
    session.multiSelectAnswers = [];
    session.answers[question.key] = null;
    session.currentQuestionIndex = qi + 1;
    await session.save();
    return askQuestion(session, toNumber, qi + 1);
  }

  // Toggle selection
  const option = activeOptions.find(
    (o) => o.value === input || o.label.toLowerCase() === input.toLowerCase()
  );
  if (!option) {
    await msg91.sendTextMessage(toNumber, '⚠️ Please select from the options above, or tap Done when finished.', session._id);
    return;
  }

  const current = session.multiSelectAnswers || [];
  if (option.value === 'none' || option.label.toLowerCase() === 'none') {
    // "None" clears all others
    session.multiSelectAnswers = ['None'];
  } else {
    // Remove "None" if it was selected, then toggle
    const withoutNone = current.filter((s) => s !== 'None');
    const idx = withoutNone.indexOf(option.label);
    if (idx >= 0) {
      withoutNone.splice(idx, 1);
    } else {
      withoutNone.push(option.label);
    }
    session.multiSelectAnswers = withoutNone;
  }
  await session.save();

  const selectedList = session.multiSelectAnswers.length > 0
    ? `✅ Selected: ${session.multiSelectAnswers.join(', ')}`
    : '_Nothing selected yet._';

  const buttons = activeOptions.map((opt) => ({
    id: opt.value,
    label: (session.multiSelectAnswers.includes(opt.label) ? '✅ ' : '') + opt.label,
  }));
  buttons.push({ id: '_done', label: '✅ Done' });
  if (question.isOptional) buttons.push({ id: '_skip', label: 'Skip' });

  await msg91.sendButtonMessage(
    toNumber,
    `${question.question}\n\n${selectedList}\n\n_Tap Done to continue._`,
    buttons,
    session._id
  );
}

// ─────────────────────────────────────────────────────────────
// Go Back
// ─────────────────────────────────────────────────────────────

async function goBack(session, toNumber) {
  if (session.currentQuestionIndex <= 0) {
    // At first question → go to menu
    session.phase = 'menu';
    session.status = 'awaiting_menu';
    await session.save();
    return showServiceMenu(toNumber, session._id);
  }

  session.currentQuestionIndex -= 1;
  // Clear the answer for the question we're going back to
  const flow = session.flowSnapshot;
  const questions = flow.questions.filter((q) => q.isActive !== false).sort((a, b) => a.index - b.index);
  const prevQuestion = questions[session.currentQuestionIndex];
  if (prevQuestion) {
    delete session.answers[prevQuestion.key];
  }

  session.markModified('answers');
  await session.save();
  return askQuestion(session, toNumber, session.currentQuestionIndex);
}

// ─────────────────────────────────────────────────────────────
// Lead Summary
// ─────────────────────────────────────────────────────────────

async function showSummary(session, toNumber) {
  session.phase = 'summary';
  await session.save();

  const flow = session.flowSnapshot;
  const questions = flow.questions.filter((q) => q.isActive !== false).sort((a, b) => a.index - b.index);

  let summaryLines = ['📋 *Please confirm your details:*\n'];
  summaryLines.push(`*Service:* ${session.currentService}`);

  for (const q of questions) {
    const ans = session.answers[q.key];
    if (!ans) continue;
    const displayVal = ans.displayValue || ans.value || '';
    if (displayVal && displayVal !== 'null') {
      summaryLines.push(`*${q.fieldLabel || q.question.replace(/\?$/, '')}:* ${displayVal}`);
    }
  }

  summaryLines.push('\n_Please confirm your submission:_');
  const summaryText = summaryLines.join('\n');

  await msg91.sendButtonMessage(
    toNumber,
    summaryText,
    [
      { id: '_submit', label: '✅ Submit' },
      { id: '_edit', label: '✏️ Edit' },
    ],
    session._id
  );
}

// ─────────────────────────────────────────────────────────────
// Handle Summary Input
// ─────────────────────────────────────────────────────────────

async function handleSummaryInput(session, user, text, buttonValue, toNumber) {
  const input = (buttonValue || text || '').trim().toLowerCase();

  if (input === '_submit' || input === 'submit' || input === 'yes') {
    return submitLead(session, user, toNumber);
  }

  if (input === '_edit' || input === 'edit') {
    return showEditMenu(session, toNumber);
  }

  // Re-show summary
  return showSummary(session, toNumber);
}

// ─────────────────────────────────────────────────────────────
// Edit Flow
// ─────────────────────────────────────────────────────────────

async function showEditMenu(session, toNumber) {
  session.phase = 'edit';
  await session.save();

  const flow = session.flowSnapshot;
  const questions = flow.questions.filter((q) => q.isActive !== false).sort((a, b) => a.index - b.index);
  const answeredQuestions = questions.filter((q) => session.answers[q.key] !== undefined);

  const options = answeredQuestions.map((q, i) => ({
    id: `edit_${q.key}`,
    label: `${q.fieldLabel || q.question.slice(0, 22)}`,
  }));

  await msg91.sendListMessage(
    toNumber,
    '✏️ *Which answer would you like to change?*',
    options,
    'Select a field',
    session._id
  );
}

async function handleEditInput(session, user, text, buttonValue, toNumber) {
  const input = (buttonValue || text || '').trim();

  if (input.startsWith('edit_')) {
    const key = input.replace('edit_', '');
    const flow = session.flowSnapshot;
    const questions = flow.questions.filter((q) => q.isActive !== false).sort((a, b) => a.index - b.index);
    const questionIndex = questions.findIndex((q) => q.key === key);

    if (questionIndex >= 0) {
      session.currentQuestionIndex = questionIndex;
      session.isEditing = true;
      session.editingQuestionIndex = questionIndex;
      session.phase = 'flow';
      await session.save();
      return askQuestion(session, toNumber, questionIndex);
    }
  }

  // If not a valid edit selection, show edit menu again
  return showEditMenu(session, toNumber);
}

// ─────────────────────────────────────────────────────────────
// Submit Lead
// ─────────────────────────────────────────────────────────────

async function submitLead(session, user, toNumber) {
  try {
    // Get routing team
    const serviceCategory = await ServiceCategory.findById(session.currentServiceId)
      .populate('routingTeam');

    const answers = session.answers || {};
    const mobileAnswer = answers.mobile;
    const nameAnswer = answers.name;
    const cityAnswer = answers.city || answers.state;
    const businessAnswer = answers.businessName || answers.brandName;
    const descriptionAnswer = answers.description || answers.requirement;

    // Build flat lead fields for easy querying
    const leadData = {
      user: user._id,
      whatsappNumber: session.whatsappNumber,
      name: nameAnswer?.value || null,
      mobile: mobileAnswer?.value || null,
      businessName: businessAnswer?.value || null,
      city: cityAnswer?.value || null,
      service: session.currentService,
      serviceSlug: session.currentServiceSlug,
      serviceCategory: session.currentServiceId,
      flowVersion: session.currentFlowVersion,
      conversationId: session._id,
      source: 'WhatsApp',
      isComplete: true,
      submittedAt: new Date(),
      status: 'New',
      answers: Object.entries(answers)
        .filter(([, v]) => v !== null)
        .map(([key, ans]) => ({
          questionKey: key,
          questionLabel: ans.label,
          value: ans.value,
          displayValue: ans.displayValue,
          inputType: ans.inputType,
          answeredAt: ans.answeredAt,
        })),
    };

    if (serviceCategory?.routingTeam) {
      leadData.assignedTeam = serviceCategory.routingTeam._id;
    }

    // Create lead
    const lead = await Lead.create(leadData);

    // Update user
    await User.findByIdAndUpdate(user._id, {
      $inc: { totalLeads: 1 },
      $set: {
        lastContactAt: new Date(),
        name: lead.name || undefined,
      },
    });

    // Update session
    session.phase = 'completed';
    session.status = 'completed';
    session.completedAt = new Date();
    session.lead = lead._id;
    await session.save();

    // Success message
    const successMsg =
      '🎉 *Thank you for choosing LauncherDesk!* Your request has been submitted successfully. Our business expert will contact you within 30 minutes during business hours.';

    await msg91.sendButtonMessage(
      toNumber,
      successMsg,
      [{ id: 'menu', label: '🏠 Main Menu' }],
      session._id
    );

    logger.info('[Engine] Lead submitted successfully', {
      leadId: lead.leadId,
      service: session.currentService,
      user: toNumber,
    });
  } catch (err) {
    logger.error('[Engine] Failed to submit lead', { error: err.message });
    await msg91.sendTextMessage(
      toNumber,
      '⚠️ Something went wrong while submitting your request. Please try again or type MENU to start over.',
      session._id
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

function validateAnswer(question, input) {
  if (!input || !input.trim()) {
    if (question.isOptional) return { valid: true, normalized: null };
    return { valid: false, error: 'This field is required. Please provide an answer.' };
  }

  if (question.inputType === 'MOBILE' || question.validationType === 'mobile') {
    const result = validateIndianMobile(input);
    if (!result.valid) return { valid: false, error: result.error };
    return { valid: true, normalized: result.normalized };
  }

  if (question.maxLength && input.length > question.maxLength) {
    return { valid: false, error: `Please keep your answer under ${question.maxLength} characters.` };
  }

  return { valid: true, normalized: null };
}

function getDisplayValue(question, rawInput, normalizedValue) {
  if (question.inputType === 'MOBILE') {
    // Show formatted mobile
    return normalizedValue ? `+91 ${normalizedValue.slice(0, 5)} ${normalizedValue.slice(5)}` : rawInput;
  }
  if (question.inputType === 'BUTTONS' || question.inputType === 'LIST') {
    // Try to get the label from options
    const options = question.options || [];
    const matchedOption = options.find(
      (o) => o.value === rawInput || o.label === rawInput || o.value === normalizedValue
    );
    return matchedOption ? matchedOption.label : rawInput;
  }
  return normalizedValue || rawInput;
}

// ─────────────────────────────────────────────────────────────
// User Management
// ─────────────────────────────────────────────────────────────

async function findOrCreateUser(normalizedNumber, rawNumber) {
  let user = await User.findOne({ normalizedNumber });
  if (!user) {
    user = await User.create({
      whatsappNumber: rawNumber,
      normalizedNumber,
      firstContactAt: new Date(),
      lastContactAt: new Date(),
    });
    logger.info('[Engine] New user created', { number: normalizedNumber });
  } else {
    await User.findByIdAndUpdate(user._id, { lastContactAt: new Date() });
  }
  return user;
}

function normalizeWhatsAppNumber(rawNumber) {
  // MSG91 sends numbers like 919876543210 or +919876543210
  const cleaned = String(rawNumber).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned;
  if (cleaned.length === 10) return `91${cleaned}`;
  return cleaned;
}

// ─────────────────────────────────────────────────────────────
// Inactivity Handling
// ─────────────────────────────────────────────────────────────

async function sendInactivityReminder(session) {
  const msg = `Hi! 👋 It looks like we paused here.\n\nWould you like to continue with *${session.currentService}* or start over?`;
  await msg91.sendButtonMessage(
    session.whatsappNumber,
    msg,
    [
      { id: 'continue_session', label: '▶ Continue' },
      { id: 'menu', label: '🏠 Start Over' },
    ],
    session._id
  );
  session.reminderSentAt = new Date();
  await session.save();
}

async function abandonSession(session) {
  session.status = 'abandoned';
  session.phase = 'completed';
  session.abandonedAt = new Date();

  // Save partial lead if any answers collected
  const hasAnswers = session.answers && Object.keys(session.answers).length > 0;
  if (hasAnswers && session.currentService) {
    const user = await User.findById(session.user);
    if (user) {
      const existingLead = await Lead.findOne({ conversationId: session._id });
      if (!existingLead) {
        await Lead.create({
          user: session.user,
          whatsappNumber: session.whatsappNumber,
          service: session.currentService,
          serviceSlug: session.currentServiceSlug,
          serviceCategory: session.currentServiceId,
          conversationId: session._id,
          status: 'Abandoned',
          isAbandoned: true,
          isComplete: false,
          source: 'WhatsApp',
          answers: Object.entries(session.answers)
            .filter(([, v]) => v !== null)
            .map(([key, ans]) => ({
              questionKey: key,
              questionLabel: ans.label,
              value: ans.value,
              displayValue: ans.displayValue,
            })),
        });
      }
    }
  }

  await session.save();
}

module.exports = {
  processMessage,
  showServiceMenu,
  sendInactivityReminder,
  abandonSession,
};