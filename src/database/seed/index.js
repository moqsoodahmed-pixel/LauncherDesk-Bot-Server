/**
 * LauncherDesk Database Seed Script
 *
 * Seeds all service flows exactly as specified in the DOCX:
 *   LauncherDesk_AI_WhatsApp_Bot_Conversation_Flow_Updated.docx
 *
 * Run: npm run seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ServiceCategory = require('../../models/ServiceCategory');
const Team = require('../../models/Team');
const AdminUser = require('../../models/AdminUser');
const AppSettings = require('../../models/AppSettings');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/launcherdesk';

// ─────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────

const TEAMS = [
  { name: 'Business Registration Team', slug: 'business-registration-team', color: '#3B82F6', description: 'Handles company, LLP, OPC registration' },
  { name: 'Registrations / Compliance Team', slug: 'registrations-compliance-team', color: '#10B981', description: 'Handles GST, MSME, FSSAI, ISO and other licenses' },
  { name: 'IPR Team', slug: 'ipr-team', color: '#8B5CF6', description: 'Trademark, patent and IPR services' },
  { name: 'IT / Technology Team', slug: 'it-technology-team', color: '#F59E0B', description: 'Website, app and digital services' },
  { name: 'Marketplace / Product Team', slug: 'marketplace-product-team', color: '#EF4444', description: 'CRM, ERP, software products' },
  { name: 'Finance Team', slug: 'finance-team', color: '#06B6D4', description: 'GST filing, ITR, bookkeeping' },
  { name: 'Legal / Compliance Team', slug: 'legal-compliance-team', color: '#D97706', description: 'ROC, legal notices, agreements' },
  { name: 'International Services Team', slug: 'international-services-team', color: '#7C3AED', description: 'International expansion services' },
  { name: 'Office Setup Team', slug: 'office-setup-team', color: '#DB2777', description: 'Office furniture, interior, networking' },
  { name: 'Office / Workspace Team', slug: 'office-workspace-team', color: '#059669', description: 'Private office and co-working spaces' },
  { name: 'Virtual Office Team', slug: 'virtual-office-team', color: '#2563EB', description: 'Virtual office and business address' },
  { name: 'E-Stamp Team', slug: 'e-stamp-team', color: '#DC2626', description: 'E-stamp facilitation services' },
  { name: 'Sales / Expert Desk', slug: 'sales-expert-desk', color: '#7C2D12', description: 'Expert consultation and sales' },
];

// ─────────────────────────────────────────────────────────────
// Service Flow Definitions (from DOCX)
// ─────────────────────────────────────────────────────────────

function makeQuestions(defs) {
  return defs.map((d, i) => ({
    index: i,
    key: d.key,
    question: d.question,
    inputType: d.inputType,
    isRequired: d.required !== false,
    isOptional: d.optional === true,
    validationType: d.inputType === 'MOBILE' ? 'mobile' : 'none',
    options: (d.options || []).map((o, j) => ({
      label: typeof o === 'string' ? o : o.label,
      value: typeof o === 'string' ? o.toLowerCase().replace(/[\s\/&]+/g, '-').replace(/[^a-z0-9\-]/g, '') : o.value,
      order: j,
      isActive: true,
    })),
    fieldLabel: d.fieldLabel || d.question.replace(/\?$/, '').trim(),
    order: i,
    isActive: true,
  }));
}

const SERVICE_DEFINITIONS = [
  // 1. Business Registration
  {
    name: 'Business Registration',
    slug: 'business-registration',
    icon: '🏢',
    order: 1,
    teamSlug: 'business-registration-team',
    questions: makeQuestions([
      {
        key: 'registrationType',
        question: 'What would you like to register?',
        inputType: 'BUTTONS',
        fieldLabel: 'Registration Type',
        options: ['Private Limited Company', 'LLP', 'One Person Company (OPC)', 'Not Sure'],
      },
      {
        key: 'businessStatus',
        question: 'Is this a new business or already registered?',
        inputType: 'BUTTONS',
        fieldLabel: 'Business Status',
        options: ['New Business', 'Already Registered'],
      },
      {
        key: 'city',
        question: 'Which city will your business operate from?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'addOns',
        question: 'Would you also like assistance with any of these?',
        inputType: 'MULTI_SELECT',
        fieldLabel: 'Additional Services',
        optional: true,
        options: ['GST', 'MSME', 'IPR & Trademark', 'Current Account', 'Virtual Office', 'None'],
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 2. Licenses & Certifications
  {
    name: 'Licenses & Certifications',
    slug: 'licenses-certifications',
    icon: '📜',
    order: 2,
    teamSlug: 'registrations-compliance-team',
    questions: makeQuestions([
      {
        key: 'licenseType',
        question: 'Which service do you need?',
        inputType: 'LIST',
        fieldLabel: 'License / Certification',
        options: ['GST', 'MSME', 'FSSAI', 'ISO', 'IEC', 'Shop License', 'Trade License', 'Other'],
      },
      {
        key: 'actionType',
        question: 'Is this a new registration, renewal, or modification?',
        inputType: 'BUTTONS',
        fieldLabel: 'Action Type',
        options: ['New Registration', 'Renewal', 'Modification'],
      },
      {
        key: 'city',
        question: 'Which city is your business based in?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'businessName',
        question: "What's your business name?",
        inputType: 'TEXT',
        fieldLabel: 'Business Name',
        optional: true,
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 3. IPR & Trademark
  {
    name: 'IPR & Trademark',
    slug: 'ipr-trademark',
    icon: '™️',
    order: 3,
    teamSlug: 'ipr-team',
    questions: makeQuestions([
      {
        key: 'iprService',
        question: 'What do you need help with?',
        inputType: 'LIST',
        fieldLabel: 'IPR Service',
        options: ['Trademark Registration', 'Trademark Search', 'Trademark Objection / Reply', 'Trademark Renewal', 'Other IPR'],
      },
      {
        key: 'caseStatus',
        question: 'Is this a new application or an existing matter?',
        inputType: 'BUTTONS',
        fieldLabel: 'Case Status',
        options: ['New', 'Existing / Ongoing'],
      },
      {
        key: 'brandName',
        question: "What's your brand / business name?",
        inputType: 'TEXT',
        fieldLabel: 'Brand / Business Name',
      },
      {
        key: 'city',
        question: 'Which city are you in?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 4. IT Services
  {
    name: 'IT Services',
    slug: 'it-services',
    icon: '💻',
    order: 4,
    teamSlug: 'it-technology-team',
    questions: makeQuestions([
      {
        key: 'itCategory',
        question: 'What do you need?',
        inputType: 'BUTTONS',
        fieldLabel: 'IT Category',
        options: ['Website Development', 'Mobile Solutions', 'Marketing & Sales', 'Digital Marketing'],
      },
      {
        key: 'specificService',
        question: 'Which specific service?',
        inputType: 'LIST',
        fieldLabel: 'Specific Service',
        options: ['Static Website', 'Dynamic Website', 'E-commerce Website', 'CRM / Portal', 'Mobile App', 'Digital Marketing', 'SEO', 'Other'],
      },
      {
        key: 'hasRegisteredBusiness',
        question: 'Do you already have a registered business?',
        inputType: 'BUTTONS',
        fieldLabel: 'Has Registered Business',
        options: ['Yes', 'No'],
      },
      {
        key: 'city',
        question: 'Which city are you in?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 5. Marketplace Software
  {
    name: 'Marketplace Software',
    slug: 'marketplace-software',
    icon: '🛒',
    order: 5,
    teamSlug: 'marketplace-product-team',
    questions: makeQuestions([
      {
        key: 'softwareType',
        question: 'Which software do you need?',
        inputType: 'LIST',
        fieldLabel: 'Software',
        options: ['CRM', 'ERP', 'Project Management', 'HR & Payroll', 'Inventory Management', 'WhatsApp Automation', 'CLM'],
      },
      {
        key: 'requirement',
        question: 'What is the main requirement?',
        inputType: 'BUTTONS',
        fieldLabel: 'Main Requirement',
        options: ['New Software', 'Customisation', 'Demo / Consultation', 'Existing Software Support'],
      },
      {
        key: 'businessName',
        question: "What's your business name?",
        inputType: 'TEXT',
        fieldLabel: 'Business Name',
        optional: true,
      },
      {
        key: 'userCount',
        question: 'How many users / employees will use it?',
        inputType: 'BUTTONS',
        fieldLabel: 'User Count',
        options: ['1–10', '11–50', '51–200', '200+'],
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 6. Finance & Accounts
  {
    name: 'Finance & Accounts',
    slug: 'finance-accounts',
    icon: '💰',
    order: 6,
    teamSlug: 'finance-team',
    questions: makeQuestions([
      {
        key: 'financeService',
        question: 'Which service do you need?',
        inputType: 'LIST',
        fieldLabel: 'Finance Service',
        options: ['GST Filing', 'Income Tax Return', 'Bookkeeping', 'Payroll', 'Audit', 'CFO Services'],
      },
      {
        key: 'businessType',
        question: "What's your business type?",
        inputType: 'BUTTONS',
        fieldLabel: 'Business Type',
        options: ['Individual', 'Proprietor', 'Company', 'LLP'],
      },
      {
        key: 'city',
        question: 'Which city are you in?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 7. Legal & Compliance
  {
    name: 'Legal & Compliance',
    slug: 'legal-compliance',
    icon: '⚖️',
    order: 7,
    teamSlug: 'legal-compliance-team',
    questions: makeQuestions([
      {
        key: 'legalService',
        question: 'Which service do you need?',
        inputType: 'LIST',
        fieldLabel: 'Legal Service',
        options: ['ROC Filing', 'Labour Compliance', 'Company Annual Filing', 'Agreement Drafting', 'Legal Notice', 'Contract Review'],
      },
      {
        key: 'matterStatus',
        question: 'Is this a new requirement or an existing / ongoing case?',
        inputType: 'BUTTONS',
        fieldLabel: 'Matter Status',
        options: ['New', 'Existing / Ongoing'],
      },
      {
        key: 'businessName',
        question: "What's your business name?",
        inputType: 'TEXT',
        fieldLabel: 'Business Name',
      },
      {
        key: 'city',
        question: 'Which city are you in?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 8. International Expansion
  {
    name: 'International Expansion',
    slug: 'international-expansion',
    icon: '🌍',
    order: 8,
    teamSlug: 'international-services-team',
    questions: makeQuestions([
      {
        key: 'country',
        question: 'Which country are you expanding to?',
        inputType: 'LIST',
        fieldLabel: 'Target Country',
        options: ['UAE', 'Saudi Arabia', 'Qatar', 'Oman', 'USA', 'UK', 'Singapore', 'Other'],
      },
      {
        key: 'intlRequirement',
        question: 'What do you need help with?',
        inputType: 'LIST',
        fieldLabel: 'Requirement',
        options: ['Company Setup', 'Business Visa', 'Bank Account', 'VAT', 'Import Export', 'Tax Advice'],
      },
      {
        key: 'businessName',
        question: "What's your business name?",
        inputType: 'TEXT',
        fieldLabel: 'Business Name',
        optional: true,
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 9. Office Setup
  {
    name: 'Office Setup',
    slug: 'office-setup',
    icon: '🏗️',
    order: 9,
    teamSlug: 'office-setup-team',
    questions: makeQuestions([
      {
        key: 'officeRequirement',
        question: 'What do you need?',
        inputType: 'LIST',
        fieldLabel: 'Office Requirement',
        options: ['Office Furniture & Setup', 'Interior', 'Networking', 'CCTV', 'Biometric', 'Complete Office Setup'],
      },
      {
        key: 'city',
        question: 'Which city is the office in?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'officeSize',
        question: "What's the office size?",
        inputType: 'BUTTONS',
        fieldLabel: 'Office Size',
        options: ['Small', 'Medium', 'Large'],
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 10. Office Space (Private / Co-working)
  {
    name: 'Office Space',
    slug: 'office-space',
    icon: '🏠',
    order: 10,
    teamSlug: 'office-workspace-team',
    questions: makeQuestions([
      {
        key: 'spaceType',
        question: 'What type of office space do you need?',
        inputType: 'BUTTONS',
        fieldLabel: 'Space Type',
        options: ['Private Office Space', 'Co-working Space'],
      },
      {
        key: 'city',
        question: 'Which city do you need it in?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'headcount',
        question: 'How many people will use the space?',
        inputType: 'BUTTONS',
        fieldLabel: 'Headcount',
        options: ['1–5', '6–10', '11–25', '25+'],
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 11. Virtual Office
  {
    name: 'Virtual Office',
    slug: 'virtual-office',
    icon: '🖥️',
    order: 11,
    teamSlug: 'virtual-office-team',
    questions: makeQuestions([
      {
        key: 'virtualOfficePurpose',
        question: 'What do you need the virtual office for?',
        inputType: 'LIST',
        fieldLabel: 'Purpose',
        options: ['GST Registration', 'Company Incorporation', 'Business Address', 'Professional Correspondence', 'Other'],
      },
      {
        key: 'city',
        question: 'Which city do you need the address in?',
        inputType: 'TEXT',
        fieldLabel: 'City',
      },
      {
        key: 'businessStatus',
        question: 'Is this for a new or existing business?',
        inputType: 'BUTTONS',
        fieldLabel: 'Business Status',
        options: ['New Business', 'Existing Business'],
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 12. E-Stamp
  {
    name: 'E-Stamp',
    slug: 'e-stamp',
    icon: '🔏',
    order: 12,
    teamSlug: 'e-stamp-team',
    questions: makeQuestions([
      {
        key: 'stampPurpose',
        question: 'What do you need an E-Stamp for?',
        inputType: 'BUTTONS',
        fieldLabel: 'E-Stamp Purpose',
        options: ['Property', 'Business', 'Personal', 'Agreement / Contract', 'Other'],
      },
      {
        key: 'state',
        question: 'Which state is the E-Stamp required in?',
        inputType: 'TEXT',
        fieldLabel: 'State',
      },
      {
        key: 'documentDescription',
        question: 'What document / agreement is it for?',
        inputType: 'TEXT',
        fieldLabel: 'Document Description',
        optional: true,
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
    ]),
  },

  // 13. Talk to an Expert
  {
    name: 'Talk to an Expert',
    slug: 'talk-to-expert',
    icon: '📞',
    order: 13,
    teamSlug: 'sales-expert-desk',
    questions: makeQuestions([
      {
        key: 'contactMethod',
        question: 'How would you like us to reach you?',
        inputType: 'BUTTONS',
        fieldLabel: 'Contact Method',
        options: ['Phone Call', 'WhatsApp', 'Video Meeting', 'Office Visit'],
      },
      {
        key: 'description',
        question: 'Briefly describe what you need help with.',
        inputType: 'TEXT',
        fieldLabel: 'Description',
      },
      {
        key: 'name',
        question: "What's your name?",
        inputType: 'TEXT',
        fieldLabel: 'Name',
      },
      {
        key: 'mobile',
        question: "What's your mobile number?",
        inputType: 'MOBILE',
        fieldLabel: 'Mobile Number',
      },
      {
        key: 'preferredTime',
        question: "What's the best time to reach you?",
        inputType: 'BUTTONS',
        fieldLabel: 'Preferred Time',
        options: ['Morning', 'Afternoon', 'Evening'],
      },
    ]),
  },
];

// ─────────────────────────────────────────────────────────────
// Seed function
// ─────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB:', MONGODB_URI);

  // ── Teams ─────────────────────────────────────────────────
  console.log('\n📦 Seeding teams...');
  const teamMap = {};
  for (const teamDef of TEAMS) {
    const team = await Team.findOneAndUpdate(
      { slug: teamDef.slug },
      teamDef,
      { upsert: true, new: true, runValidators: true }
    );
    teamMap[teamDef.slug] = team._id;
    console.log(`  ✓ Team: ${team.name}`);
  }

  // ── Services & Flows ──────────────────────────────────────
  console.log('\n📦 Seeding services & flows...');
  for (const def of SERVICE_DEFINITIONS) {
    const flowData = {
      version: 1,
      isActive: true,
      questions: def.questions,
      totalSteps: def.questions.length,
    };

    const routingTeamId = teamMap[def.teamSlug];
    const serviceData = {
      name: def.name,
      slug: def.slug,
      icon: def.icon,
      order: def.order,
      isActive: true,
      routingTeam: routingTeamId,
      currentFlowVersion: 1,
    };

    // Check if service exists
    let service = await ServiceCategory.findOne({ slug: def.slug });
    if (service) {
      service.name = serviceData.name;
      service.icon = serviceData.icon;
      service.order = serviceData.order;
      service.routingTeam = routingTeamId;
      // Re-seed the flow (reset to v1)
      service.flows = [flowData];
      service.currentFlowVersion = 1;
      await service.save();
      console.log(`  ↻ Updated: ${def.name} (${def.questions.length} questions)`);
    } else {
      service = await ServiceCategory.create({
        ...serviceData,
        flows: [flowData],
      });
      console.log(`  ✓ Created: ${def.name} (${def.questions.length} questions)`);
    }
  }

  // ── Admin User ─────────────────────────────────────────────
  console.log('\n📦 Seeding admin user...');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@launcherdesk.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const existingAdmin = await AdminUser.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await AdminUser.create({
      name: 'Super Admin',
      email: adminEmail,
      password: adminPassword,
      role: 'SUPER_ADMIN',
    });
    console.log(`  ✓ Admin created: ${adminEmail}`);
    console.log(`  ⚠️  Default password: ${adminPassword} — CHANGE THIS AFTER FIRST LOGIN`);
  } else {
    console.log(`  ℹ️  Admin already exists: ${adminEmail}`);
  }

  // ── App Settings ──────────────────────────────────────────
  console.log('\n📦 Seeding app settings...');
  const defaultSettings = [
    { key: 'app_name', value: 'LauncherDesk', description: 'Application name', isPublic: true },
    { key: 'whatsapp_welcome_message', value: "👋 Welcome to LauncherDesk! We're here to help you start, manage and grow your business. Please choose a service below.", isPublic: false },
    { key: 'success_message', value: '🎉 Thank you for choosing LauncherDesk! Your request has been submitted successfully. Our business expert will contact you within 30 minutes during business hours.', isPublic: false },
    { key: 'inactivity_reminder_minutes', value: 10, isPublic: false },
    { key: 'session_abandon_hours', value: 24, isPublic: false },
    { key: 'business_hours_start', value: '09:00', isPublic: true },
    { key: 'business_hours_end', value: '19:00', isPublic: true },
  ];

  for (const setting of defaultSettings) {
    await AppSettings.findOneAndUpdate(
      { key: setting.key },
      setting,
      { upsert: true, new: true }
    );
  }
  console.log(`  ✓ ${defaultSettings.length} settings seeded`);

  console.log('\n🎉 Database seeding complete!\n');
  console.log('─'.repeat(50));
  console.log('Admin Login:');
  console.log(`  URL:      http://localhost:5173/login`);
  console.log(`  Email:    ${adminEmail}`);
  console.log(`  Password: ${process.env.ADMIN_PASSWORD || 'Admin@123456'}`);
  console.log('─'.repeat(50));

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
