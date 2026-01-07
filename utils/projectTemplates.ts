import { ProjectCategory, ProjectPhase, ProjectRisk, PerformanceMetric } from '../types';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  icon: string; // Lucide icon name
  color: string;
  phases: Omit<ProjectPhase, 'id' | 'status' | 'progress'>[];
  defaultRisks: Omit<ProjectRisk, 'id' | 'status'>[];
  defaultMetrics: Omit<PerformanceMetric, 'id' | 'current' | 'trend'>[];
  suggestedTags: string[];
  estimatedDuration: string; // e.g., "3-6 months"
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // IT / Software Development
  {
    id: 'software-development',
    name: 'Software Development',
    description: 'Agile software development project with sprints and releases',
    category: 'IT',
    icon: 'Monitor',
    color: 'text-blue-500 bg-blue-500/10',
    phases: [
      { name: 'Discovery & Planning', description: 'Requirements gathering and project scoping', order: 1, deliverables: ['Project Charter', 'Requirements Document', 'Technical Specifications'] },
      { name: 'Design', description: 'System architecture and UI/UX design', order: 2, deliverables: ['System Architecture', 'Database Design', 'UI Mockups', 'API Design'] },
      { name: 'Development Sprint 1', description: 'Core features development', order: 3, deliverables: ['Core Backend', 'Authentication', 'Basic UI'] },
      { name: 'Development Sprint 2', description: 'Feature completion', order: 4, deliverables: ['All Features', 'Integration', 'Unit Tests'] },
      { name: 'Testing & QA', description: 'Quality assurance and bug fixes', order: 5, deliverables: ['Test Reports', 'Bug Fixes', 'Performance Optimization'] },
      { name: 'Deployment & Launch', description: 'Production deployment and go-live', order: 6, deliverables: ['Production Environment', 'Documentation', 'Training Materials'] },
    ],
    defaultRisks: [
      { title: 'Scope Creep', description: 'Uncontrolled changes to project scope', severity: 'High', likelihood: 'High', mitigation: 'Strict change control process' },
      { title: 'Technical Debt', description: 'Shortcuts affecting future development', severity: 'Medium', likelihood: 'Medium', mitigation: 'Code reviews and refactoring sprints' },
      { title: 'Resource Availability', description: 'Key developers unavailable', severity: 'High', likelihood: 'Low', mitigation: 'Cross-training and documentation' },
    ],
    defaultMetrics: [
      { name: 'Sprint Velocity', target: 40, unit: 'points' },
      { name: 'Code Coverage', target: 80, unit: '%' },
      { name: 'Bug Count', target: 0, unit: 'critical bugs' },
      { name: 'Deployment Frequency', target: 2, unit: 'per week' },
    ],
    suggestedTags: ['agile', 'software', 'development', 'tech'],
    estimatedDuration: '3-6 months',
  },

  // Green Energy
  {
    id: 'renewable-energy',
    name: 'Renewable Energy Installation',
    description: 'Solar, wind, or other renewable energy project',
    category: 'Green Energy',
    icon: 'Leaf',
    color: 'text-green-500 bg-green-500/10',
    phases: [
      { name: 'Feasibility Study', description: 'Site assessment and energy potential analysis', order: 1, deliverables: ['Site Assessment Report', 'Energy Yield Analysis', 'Cost-Benefit Analysis'] },
      { name: 'Design & Engineering', description: 'Technical design and system sizing', order: 2, deliverables: ['System Design', 'Engineering Drawings', 'Equipment Specifications'] },
      { name: 'Permits & Approvals', description: 'Regulatory compliance and permits', order: 3, deliverables: ['Building Permits', 'Grid Connection Agreement', 'Environmental Clearance'] },
      { name: 'Procurement', description: 'Equipment and material sourcing', order: 4, deliverables: ['Purchase Orders', 'Delivery Schedule', 'Vendor Contracts'] },
      { name: 'Installation', description: 'Physical installation and wiring', order: 5, deliverables: ['Installed Equipment', 'Electrical Connections', 'Safety Systems'] },
      { name: 'Commissioning', description: 'Testing and grid connection', order: 6, deliverables: ['Test Reports', 'Grid Connection', 'Performance Verification'] },
    ],
    defaultRisks: [
      { title: 'Permit Delays', description: 'Regulatory approval taking longer than expected', severity: 'High', likelihood: 'Medium', mitigation: 'Early engagement with authorities' },
      { title: 'Weather Delays', description: 'Installation delayed due to weather', severity: 'Medium', likelihood: 'Medium', mitigation: 'Flexible scheduling and buffer time' },
      { title: 'Supply Chain Issues', description: 'Equipment delivery delays', severity: 'High', likelihood: 'Medium', mitigation: 'Multiple suppliers and early ordering' },
    ],
    defaultMetrics: [
      { name: 'Energy Output', target: 100, unit: 'kWh/day' },
      { name: 'Installation Progress', target: 100, unit: '%' },
      { name: 'Budget Utilization', target: 100, unit: '%' },
      { name: 'Safety Incidents', target: 0, unit: 'incidents' },
    ],
    suggestedTags: ['renewable', 'solar', 'wind', 'sustainability', 'green'],
    estimatedDuration: '6-12 months',
  },

  // Finance
  {
    id: 'financial-system',
    name: 'Financial System Implementation',
    description: 'ERP, accounting, or financial software implementation',
    category: 'Finance',
    icon: 'DollarSign',
    color: 'text-emerald-500 bg-emerald-500/10',
    phases: [
      { name: 'Assessment & Planning', description: 'Current state analysis and requirements', order: 1, deliverables: ['Gap Analysis', 'Requirements Document', 'Implementation Plan'] },
      { name: 'System Configuration', description: 'Configure system to business needs', order: 2, deliverables: ['Chart of Accounts', 'Workflow Configuration', 'User Roles'] },
      { name: 'Data Migration', description: 'Historical data transfer', order: 3, deliverables: ['Data Mapping', 'Migration Scripts', 'Validation Reports'] },
      { name: 'Integration', description: 'Connect with existing systems', order: 4, deliverables: ['API Integrations', 'Bank Connections', 'Third-party Links'] },
      { name: 'User Training', description: 'Train staff on new system', order: 5, deliverables: ['Training Materials', 'User Guides', 'Certification'] },
      { name: 'Go-Live & Support', description: 'Launch and stabilization', order: 6, deliverables: ['Production Cutover', 'Support Procedures', 'Performance Monitoring'] },
    ],
    defaultRisks: [
      { title: 'Data Quality Issues', description: 'Dirty data affecting migration', severity: 'High', likelihood: 'High', mitigation: 'Data cleansing before migration' },
      { title: 'User Adoption', description: 'Staff resistance to new system', severity: 'Medium', likelihood: 'Medium', mitigation: 'Change management and training' },
      { title: 'Compliance Gaps', description: 'System not meeting regulatory requirements', severity: 'Critical', likelihood: 'Low', mitigation: 'Compliance review at each phase' },
    ],
    defaultMetrics: [
      { name: 'Data Migration Accuracy', target: 99.9, unit: '%' },
      { name: 'User Training Completion', target: 100, unit: '%' },
      { name: 'System Uptime', target: 99.9, unit: '%' },
      { name: 'Transaction Processing Time', target: 2, unit: 'seconds' },
    ],
    suggestedTags: ['finance', 'erp', 'accounting', 'compliance'],
    estimatedDuration: '4-8 months',
  },

  // Health
  {
    id: 'healthcare-initiative',
    name: 'Healthcare Initiative',
    description: 'Healthcare program or facility improvement project',
    category: 'Health',
    icon: 'Heart',
    color: 'text-red-500 bg-red-500/10',
    phases: [
      { name: 'Needs Assessment', description: 'Identify healthcare gaps and priorities', order: 1, deliverables: ['Needs Assessment Report', 'Stakeholder Input', 'Priority Matrix'] },
      { name: 'Program Design', description: 'Design intervention or facility plan', order: 2, deliverables: ['Program Design Document', 'Resource Plan', 'Timeline'] },
      { name: 'Regulatory Approval', description: 'Obtain necessary healthcare approvals', order: 3, deliverables: ['Regulatory Submissions', 'Approvals', 'Compliance Documentation'] },
      { name: 'Implementation', description: 'Execute the healthcare initiative', order: 4, deliverables: ['Trained Staff', 'Operational Procedures', 'Equipment Setup'] },
      { name: 'Quality Assurance', description: 'Ensure quality standards are met', order: 5, deliverables: ['Quality Metrics', 'Patient Feedback', 'Accreditation'] },
      { name: 'Evaluation & Sustainability', description: 'Measure outcomes and ensure long-term success', order: 6, deliverables: ['Outcome Report', 'Sustainability Plan', 'Best Practices'] },
    ],
    defaultRisks: [
      { title: 'Regulatory Changes', description: 'Healthcare regulations changing mid-project', severity: 'High', likelihood: 'Medium', mitigation: 'Regulatory monitoring and flexibility' },
      { title: 'Staffing Challenges', description: 'Difficulty recruiting qualified healthcare staff', severity: 'High', likelihood: 'Medium', mitigation: 'Early recruitment and partnerships' },
      { title: 'Patient Safety Concerns', description: 'Risks to patient safety during transition', severity: 'Critical', likelihood: 'Low', mitigation: 'Safety protocols and phased rollout' },
    ],
    defaultMetrics: [
      { name: 'Patient Satisfaction', target: 90, unit: '%' },
      { name: 'Treatment Success Rate', target: 95, unit: '%' },
      { name: 'Staff Training Completion', target: 100, unit: '%' },
      { name: 'Compliance Score', target: 100, unit: '%' },
    ],
    suggestedTags: ['healthcare', 'medical', 'patient-care', 'wellness'],
    estimatedDuration: '6-18 months',
  },

  // Construction
  {
    id: 'construction-project',
    name: 'Construction Project',
    description: 'Building or infrastructure construction project',
    category: 'Construction',
    icon: 'Building',
    color: 'text-orange-500 bg-orange-500/10',
    phases: [
      { name: 'Pre-Construction', description: 'Planning, permits, and site preparation', order: 1, deliverables: ['Building Permits', 'Site Survey', 'Construction Schedule'] },
      { name: 'Foundation', description: 'Foundation and underground work', order: 2, deliverables: ['Foundation Complete', 'Underground Utilities', 'Inspections Passed'] },
      { name: 'Structural Work', description: 'Main structure construction', order: 3, deliverables: ['Structural Frame', 'Roofing', 'Exterior Walls'] },
      { name: 'MEP Installation', description: 'Mechanical, electrical, plumbing', order: 4, deliverables: ['HVAC System', 'Electrical Wiring', 'Plumbing'] },
      { name: 'Interior Finishing', description: 'Interior work and finishes', order: 5, deliverables: ['Drywall', 'Flooring', 'Paint', 'Fixtures'] },
      { name: 'Final Inspection & Handover', description: 'Inspections and project completion', order: 6, deliverables: ['Certificate of Occupancy', 'Punch List Complete', 'Owner Training'] },
    ],
    defaultRisks: [
      { title: 'Weather Delays', description: 'Construction delayed due to weather conditions', severity: 'Medium', likelihood: 'High', mitigation: 'Weather contingency in schedule' },
      { title: 'Material Price Increases', description: 'Cost overruns due to material costs', severity: 'High', likelihood: 'Medium', mitigation: 'Fixed-price contracts where possible' },
      { title: 'Safety Incidents', description: 'Worker injuries on site', severity: 'Critical', likelihood: 'Low', mitigation: 'Strict safety protocols and training' },
      { title: 'Subcontractor Issues', description: 'Subcontractor delays or quality problems', severity: 'High', likelihood: 'Medium', mitigation: 'Vetted subcontractors and backup options' },
    ],
    defaultMetrics: [
      { name: 'Schedule Adherence', target: 100, unit: '%' },
      { name: 'Budget Variance', target: 0, unit: '%' },
      { name: 'Safety Incidents', target: 0, unit: 'incidents' },
      { name: 'Quality Score', target: 95, unit: '%' },
    ],
    suggestedTags: ['construction', 'building', 'infrastructure', 'civil'],
    estimatedDuration: '12-24 months',
  },

  // Marketing
  {
    id: 'marketing-campaign',
    name: 'Marketing Campaign',
    description: 'Product launch or marketing campaign project',
    category: 'Marketing',
    icon: 'Megaphone',
    color: 'text-indigo-500 bg-indigo-500/10',
    phases: [
      { name: 'Research & Strategy', description: 'Market research and campaign strategy', order: 1, deliverables: ['Market Analysis', 'Target Audience', 'Campaign Strategy'] },
      { name: 'Creative Development', description: 'Content and creative asset creation', order: 2, deliverables: ['Brand Guidelines', 'Ad Creatives', 'Copy', 'Video Content'] },
      { name: 'Channel Setup', description: 'Configure marketing channels', order: 3, deliverables: ['Ad Accounts', 'Landing Pages', 'Email Sequences', 'Social Profiles'] },
      { name: 'Campaign Launch', description: 'Go live with campaign', order: 4, deliverables: ['Live Ads', 'Press Release', 'Influencer Outreach'] },
      { name: 'Optimization', description: 'Monitor and optimize performance', order: 5, deliverables: ['A/B Test Results', 'Optimized Campaigns', 'Retargeting'] },
      { name: 'Analysis & Reporting', description: 'Measure results and learnings', order: 6, deliverables: ['Campaign Report', 'ROI Analysis', 'Recommendations'] },
    ],
    defaultRisks: [
      { title: 'Low Engagement', description: 'Campaign not resonating with audience', severity: 'High', likelihood: 'Medium', mitigation: 'Pre-launch testing and quick pivots' },
      { title: 'Budget Overrun', description: 'Ad spend exceeding budget', severity: 'Medium', likelihood: 'Medium', mitigation: 'Daily budget caps and monitoring' },
      { title: 'Brand Reputation', description: 'Negative reception affecting brand', severity: 'High', likelihood: 'Low', mitigation: 'Crisis communication plan ready' },
    ],
    defaultMetrics: [
      { name: 'Impressions', target: 1000000, unit: 'views' },
      { name: 'Click-Through Rate', target: 2.5, unit: '%' },
      { name: 'Conversion Rate', target: 3, unit: '%' },
      { name: 'Return on Ad Spend', target: 300, unit: '%' },
      { name: 'Brand Awareness Lift', target: 20, unit: '%' },
    ],
    suggestedTags: ['marketing', 'campaign', 'advertising', 'brand'],
    estimatedDuration: '2-4 months',
  },

  // Research
  {
    id: 'research-project',
    name: 'Research Project',
    description: 'Academic or R&D research initiative',
    category: 'Research',
    icon: 'FlaskConical',
    color: 'text-cyan-500 bg-cyan-500/10',
    phases: [
      { name: 'Literature Review', description: 'Review existing research and identify gaps', order: 1, deliverables: ['Literature Review Document', 'Research Gap Analysis', 'Hypothesis'] },
      { name: 'Methodology Design', description: 'Design research methodology', order: 2, deliverables: ['Research Protocol', 'Ethics Approval', 'Data Collection Plan'] },
      { name: 'Data Collection', description: 'Gather research data', order: 3, deliverables: ['Raw Data', 'Data Quality Report', 'Participant Records'] },
      { name: 'Data Analysis', description: 'Analyze collected data', order: 4, deliverables: ['Statistical Analysis', 'Findings Summary', 'Visualizations'] },
      { name: 'Writing & Review', description: 'Write up findings and peer review', order: 5, deliverables: ['Research Paper Draft', 'Peer Review Feedback', 'Final Paper'] },
      { name: 'Publication & Dissemination', description: 'Publish and share findings', order: 6, deliverables: ['Published Paper', 'Conference Presentation', 'Press Release'] },
    ],
    defaultRisks: [
      { title: 'Data Quality Issues', description: 'Insufficient or poor quality data', severity: 'High', likelihood: 'Medium', mitigation: 'Robust data validation procedures' },
      { title: 'Ethics Approval Delays', description: 'IRB or ethics approval taking longer', severity: 'Medium', likelihood: 'Medium', mitigation: 'Early submission and follow-up' },
      { title: 'Negative Results', description: 'Research not supporting hypothesis', severity: 'Medium', likelihood: 'Medium', mitigation: 'Publish regardless, adjust hypothesis' },
    ],
    defaultMetrics: [
      { name: 'Data Points Collected', target: 500, unit: 'samples' },
      { name: 'Statistical Significance', target: 95, unit: '%' },
      { name: 'Paper Citations', target: 10, unit: 'citations' },
      { name: 'Grant Funding Secured', target: 50000, unit: '$' },
    ],
    suggestedTags: ['research', 'academic', 'r&d', 'science'],
    estimatedDuration: '6-24 months',
  },

  // Startup
  {
    id: 'startup-launch',
    name: 'Startup Launch',
    description: 'New business or product launch project',
    category: 'Startup',
    icon: 'Rocket',
    color: 'text-violet-500 bg-violet-500/10',
    phases: [
      { name: 'Ideation & Validation', description: 'Validate business idea and market fit', order: 1, deliverables: ['Business Model Canvas', 'Customer Interviews', 'MVP Definition'] },
      { name: 'MVP Development', description: 'Build minimum viable product', order: 2, deliverables: ['Working MVP', 'Landing Page', 'Demo Video'] },
      { name: 'Beta Testing', description: 'Test with early adopters', order: 3, deliverables: ['Beta User Feedback', 'Product Iterations', 'Testimonials'] },
      { name: 'Fundraising', description: 'Secure funding for growth', order: 4, deliverables: ['Pitch Deck', 'Financial Model', 'Term Sheet'] },
      { name: 'Launch', description: 'Public launch and growth', order: 5, deliverables: ['Press Coverage', 'Marketing Campaign', 'First Customers'] },
      { name: 'Scale', description: 'Scale operations and team', order: 6, deliverables: ['Team Expansion', 'Process Documentation', 'Growth Metrics'] },
    ],
    defaultRisks: [
      { title: 'Product-Market Fit', description: 'Product not meeting market needs', severity: 'Critical', likelihood: 'Medium', mitigation: 'Continuous customer feedback and iteration' },
      { title: 'Funding Gap', description: 'Unable to secure needed funding', severity: 'Critical', likelihood: 'Medium', mitigation: 'Multiple funding sources and runway management' },
      { title: 'Competition', description: 'Competitors entering market', severity: 'High', likelihood: 'Medium', mitigation: 'Speed to market and differentiation' },
      { title: 'Founder Burnout', description: 'Team exhaustion affecting progress', severity: 'Medium', likelihood: 'High', mitigation: 'Sustainable pace and support systems' },
    ],
    defaultMetrics: [
      { name: 'Monthly Active Users', target: 1000, unit: 'users' },
      { name: 'Monthly Recurring Revenue', target: 10000, unit: '$' },
      { name: 'Customer Acquisition Cost', target: 50, unit: '$' },
      { name: 'Net Promoter Score', target: 50, unit: 'NPS' },
      { name: 'Runway', target: 12, unit: 'months' },
    ],
    suggestedTags: ['startup', 'launch', 'mvp', 'growth'],
    estimatedDuration: '6-12 months',
  },

  // Personal Project
  {
    id: 'personal-goal',
    name: 'Personal Goal Project',
    description: 'Personal development or life goal project',
    category: 'Personal',
    icon: 'User',
    color: 'text-teal-500 bg-teal-500/10',
    phases: [
      { name: 'Goal Definition', description: 'Define clear, measurable goal', order: 1, deliverables: ['SMART Goal Statement', 'Success Criteria', 'Timeline'] },
      { name: 'Planning', description: 'Create action plan', order: 2, deliverables: ['Action Steps', 'Resource List', 'Schedule'] },
      { name: 'Skill Building', description: 'Develop necessary skills', order: 3, deliverables: ['Courses Completed', 'Practice Hours', 'Skill Assessment'] },
      { name: 'Execution', description: 'Take action towards goal', order: 4, deliverables: ['Milestones Achieved', 'Progress Journal', 'Adjustments Made'] },
      { name: 'Review & Adjust', description: 'Evaluate progress and adjust', order: 5, deliverables: ['Progress Review', 'Lessons Learned', 'Updated Plan'] },
      { name: 'Achievement & Next Steps', description: 'Celebrate and plan next goal', order: 6, deliverables: ['Goal Achieved', 'Celebration', 'Next Goal Identified'] },
    ],
    defaultRisks: [
      { title: 'Motivation Loss', description: 'Losing motivation over time', severity: 'High', likelihood: 'High', mitigation: 'Accountability partner and rewards' },
      { title: 'Time Constraints', description: 'Not enough time for goal', severity: 'Medium', likelihood: 'High', mitigation: 'Time blocking and prioritization' },
      { title: 'Setbacks', description: 'Unexpected obstacles', severity: 'Medium', likelihood: 'Medium', mitigation: 'Flexible plan and resilience mindset' },
    ],
    defaultMetrics: [
      { name: 'Weekly Progress', target: 100, unit: '%' },
      { name: 'Habit Streak', target: 30, unit: 'days' },
      { name: 'Skills Acquired', target: 5, unit: 'skills' },
      { name: 'Overall Completion', target: 100, unit: '%' },
    ],
    suggestedTags: ['personal', 'goal', 'self-improvement', 'growth'],
    estimatedDuration: '1-12 months',
  },

  // Education
  {
    id: 'education-program',
    name: 'Education Program',
    description: 'Course development or educational initiative',
    category: 'Education',
    icon: 'GraduationCap',
    color: 'text-purple-500 bg-purple-500/10',
    phases: [
      { name: 'Needs Analysis', description: 'Identify learning needs and objectives', order: 1, deliverables: ['Learning Objectives', 'Target Audience Profile', 'Curriculum Outline'] },
      { name: 'Content Development', description: 'Create educational content', order: 2, deliverables: ['Course Materials', 'Presentations', 'Assessments'] },
      { name: 'Platform Setup', description: 'Configure learning platform', order: 3, deliverables: ['LMS Configuration', 'Course Upload', 'User Access'] },
      { name: 'Pilot Program', description: 'Test with initial learners', order: 4, deliverables: ['Pilot Feedback', 'Content Revisions', 'Instructor Training'] },
      { name: 'Full Launch', description: 'Roll out to all learners', order: 5, deliverables: ['Enrollment Open', 'Support Procedures', 'Marketing'] },
      { name: 'Evaluation & Improvement', description: 'Measure outcomes and improve', order: 6, deliverables: ['Learning Outcomes Report', 'Course Updates', 'Certification'] },
    ],
    defaultRisks: [
      { title: 'Low Engagement', description: 'Learners not engaging with content', severity: 'High', likelihood: 'Medium', mitigation: 'Interactive content and gamification' },
      { title: 'Technical Issues', description: 'Platform or access problems', severity: 'Medium', likelihood: 'Medium', mitigation: 'Tech support and backup options' },
      { title: 'Content Quality', description: 'Content not meeting learning objectives', severity: 'High', likelihood: 'Low', mitigation: 'Expert review and pilot testing' },
    ],
    defaultMetrics: [
      { name: 'Course Completion Rate', target: 85, unit: '%' },
      { name: 'Learner Satisfaction', target: 4.5, unit: '/5' },
      { name: 'Assessment Pass Rate', target: 90, unit: '%' },
      { name: 'Enrollment Numbers', target: 500, unit: 'students' },
    ],
    suggestedTags: ['education', 'learning', 'training', 'course'],
    estimatedDuration: '3-6 months',
  },
];

// Helper function to generate phases with IDs
export const generatePhasesFromTemplate = (template: ProjectTemplate): import('../types').ProjectPhase[] => {
  return template.phases.map((phase, index) => ({
    ...phase,
    id: `phase-${Date.now()}-${index}`,
    status: 'Not Started' as const,
    progress: 0,
  }));
};

// Helper function to generate risks with IDs
export const generateRisksFromTemplate = (template: ProjectTemplate): import('../types').ProjectRisk[] => {
  return template.defaultRisks.map((risk, index) => ({
    ...risk,
    id: `risk-${Date.now()}-${index}`,
    status: 'Open' as const,
  }));
};

// Helper function to generate metrics with IDs
export const generateMetricsFromTemplate = (template: ProjectTemplate): import('../types').PerformanceMetric[] => {
  return template.defaultMetrics.map((metric, index) => ({
    ...metric,
    id: `metric-${Date.now()}-${index}`,
    current: 0,
    trend: 'Stable' as const,
  }));
};
