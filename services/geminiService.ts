import { GoogleGenAI } from "@google/genai";
import { Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, CalendarEvent, Application } from '../types';

// Global API key from environment variable (set in Vercel)
const GLOBAL_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

const getApiKey = (): string => {
  // Use the global API key from environment variable
  // This removes the need for users to configure their own key
  return GLOBAL_API_KEY;
};

// Check if API is configured (for UI purposes)
export const isApiConfigured = (): boolean => {
  return !!GLOBAL_API_KEY;
};

const getAI = (): GoogleGenAI | null => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// Clean AI response to remove asterisks, dashes, and markdown formatting
const cleanResponse = (text: string): string => {
  return text
    // Remove bold/italic asterisks (**, *, ***)
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    // Remove any remaining standalone asterisks
    .replace(/\*/g, '')
    // Replace dash bullet points at start of lines with numbers or remove
    .replace(/^\s*[-–—]\s+/gm, '• ')
    // Replace markdown headers (##, ###) with plain text
    .replace(/^#{1,6}\s+/gm, '')
    // Clean up any double spaces
    .replace(/  +/g, ' ')
    .trim();
};

// ============ ACTION COMMAND INTERFACES ============

// Interface for parsed task from Iris response
export interface ParsedTask {
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate?: string;
  dueTime?: string;
  description?: string;
}

// Interface for parsed note
export interface ParsedNote {
  title: string;
  content: string;
  tags?: string[];
}

// Interface for parsed habit
export interface ParsedHabit {
  name: string;
  description?: string;
  color?: string;
}

// Interface for parsed goal
export interface ParsedGoal {
  title: string;
  category: 'Career' | 'Personal' | 'Health' | 'Skill';
  targetDate: string;
  progress?: number;
}

// Interface for parsed project
export interface ParsedProject {
  title: string;
  description: string;
  status?: 'In Progress' | 'Completed' | 'On Hold';
  priority?: 'High' | 'Medium' | 'Low';
  deadline?: string;
  tags?: string[];
  category?: string;
}

// Interface for parsed milestone
export interface ParsedMilestone {
  title: string;
  date: string;
  description: string;
  completed?: boolean;
}

// Interface for parsed event
export interface ParsedEvent {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  location?: string;
  color?: string;
  reminder?: boolean;
}

// Interface for parsed application
export interface ParsedApplication {
  name: string;
  organization?: string;
  type: 'job' | 'grant' | 'scholarship' | 'other';
  link?: string;
  submissionDeadline?: string;
  openingDate?: string;
  closingDate?: string;
  priority?: 'High' | 'Medium' | 'Low';
  notes?: string;
}

// Interface for parsed log entry
export interface ParsedLog {
  content: string;
  mood: 'Productive' | 'Neutral' | 'Frustrated' | 'Flow State';
  date?: string;
}

// Interface for parsed rant
export interface ParsedRant {
  content: string;
  mood?: 'frustrated' | 'angry' | 'overwhelmed' | 'confused';
}

// Complete actions object returned from parsing
export interface ParsedActions {
  cleanedResponse: string;
  tasks: ParsedTask[];
  notes: ParsedNote[];
  habits: ParsedHabit[];
  goals: ParsedGoal[];
  projects: ParsedProject[];
  milestones: ParsedMilestone[];
  events: ParsedEvent[];
  applications: ParsedApplication[];
  logs: ParsedLog[];
  rants: ParsedRant[];
  completedHabits: string[]; // habit names to mark as completed
  completedTasks: string[]; // task titles to mark as completed
}

// Parse all action commands from Iris response
export const parseActionCommands = (response: string): ParsedActions => {
  const actions: ParsedActions = {
    cleanedResponse: response,
    tasks: [],
    notes: [],
    habits: [],
    goals: [],
    projects: [],
    milestones: [],
    events: [],
    applications: [],
    logs: [],
    rants: [],
    completedHabits: [],
    completedTasks: [],
  };

  // Task creation
  const taskRegex = /\[CREATE_TASK:\s*(\{[^}]+\})\]/g;
  let match;
  while ((match = taskRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.tasks.push({
        title: data.title || 'Untitled Task',
        priority: ['High', 'Medium', 'Low'].includes(data.priority) ? data.priority : 'Medium',
        dueDate: data.dueDate,
        dueTime: data.dueTime,
        description: data.description,
      });
    } catch (e) {
      console.error('Failed to parse task command:', e);
    }
  }

  // Note creation
  const noteRegex = /\[CREATE_NOTE:\s*(\{[^}]+\})\]/g;
  while ((match = noteRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.notes.push({
        title: data.title || 'Untitled Note',
        content: data.content || '',
        tags: data.tags || [],
      });
    } catch (e) {
      console.error('Failed to parse note command:', e);
    }
  }

  // Habit creation
  const habitRegex = /\[CREATE_HABIT:\s*(\{[^}]+\})\]/g;
  while ((match = habitRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.habits.push({
        name: data.name || 'New Habit',
        description: data.description,
        color: data.color,
      });
    } catch (e) {
      console.error('Failed to parse habit command:', e);
    }
  }

  // Goal creation
  const goalRegex = /\[CREATE_GOAL:\s*(\{[^}]+\})\]/g;
  while ((match = goalRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.goals.push({
        title: data.title || 'New Goal',
        category: ['Career', 'Personal', 'Health', 'Skill'].includes(data.category) ? data.category : 'Personal',
        targetDate: data.targetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        progress: data.progress || 0,
      });
    } catch (e) {
      console.error('Failed to parse goal command:', e);
    }
  }

  // Project creation
  const projectRegex = /\[CREATE_PROJECT:\s*(\{[^}]+\})\]/g;
  while ((match = projectRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.projects.push({
        title: data.title || 'New Project',
        description: data.description || '',
        status: ['In Progress', 'Completed', 'On Hold'].includes(data.status) ? data.status : 'In Progress',
        priority: ['High', 'Medium', 'Low'].includes(data.priority) ? data.priority : 'Medium',
        deadline: data.deadline,
        tags: data.tags || [],
        category: data.category,
      });
    } catch (e) {
      console.error('Failed to parse project command:', e);
    }
  }

  // Milestone creation
  const milestoneRegex = /\[CREATE_MILESTONE:\s*(\{[^}]+\})\]/g;
  while ((match = milestoneRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.milestones.push({
        title: data.title || 'New Milestone',
        date: data.date || new Date().toISOString().split('T')[0],
        description: data.description || '',
        completed: data.completed || false,
      });
    } catch (e) {
      console.error('Failed to parse milestone command:', e);
    }
  }

  // Event creation
  const eventRegex = /\[CREATE_EVENT:\s*(\{[^}]+\})\]/g;
  while ((match = eventRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.events.push({
        title: data.title || 'New Event',
        date: data.date || new Date().toISOString().split('T')[0],
        startTime: data.startTime,
        endTime: data.endTime,
        description: data.description,
        location: data.location,
        color: data.color || '#3b82f6',
        reminder: data.reminder !== false,
      });
    } catch (e) {
      console.error('Failed to parse event command:', e);
    }
  }

  // Application creation
  const applicationRegex = /\[CREATE_APPLICATION:\s*(\{[^}]+\})\]/g;
  while ((match = applicationRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.applications.push({
        name: data.name || 'New Application',
        organization: data.organization,
        type: ['job', 'grant', 'scholarship', 'other'].includes(data.type) ? data.type : 'other',
        link: data.link,
        submissionDeadline: data.submissionDeadline,
        openingDate: data.openingDate,
        closingDate: data.closingDate,
        priority: ['High', 'Medium', 'Low'].includes(data.priority) ? data.priority : 'Medium',
        notes: data.notes,
      });
    } catch (e) {
      console.error('Failed to parse application command:', e);
    }
  }

  // Log creation
  const logRegex = /\[CREATE_LOG:\s*(\{[^}]+\})\]/g;
  while ((match = logRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.logs.push({
        content: data.content || '',
        mood: ['Productive', 'Neutral', 'Frustrated', 'Flow State'].includes(data.mood) ? data.mood : 'Neutral',
        date: data.date,
      });
    } catch (e) {
      console.error('Failed to parse log command:', e);
    }
  }

  // Rant creation
  const rantRegex = /\[CREATE_RANT:\s*(\{[^}]+\})\]/g;
  while ((match = rantRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.rants.push({
        content: data.content || '',
        mood: ['frustrated', 'angry', 'overwhelmed', 'confused'].includes(data.mood) ? data.mood : undefined,
      });
    } catch (e) {
      console.error('Failed to parse rant command:', e);
    }
  }

  // Complete habit
  const completeHabitRegex = /\[COMPLETE_HABIT:\s*"([^"]+)"\]/g;
  while ((match = completeHabitRegex.exec(response)) !== null) {
    actions.completedHabits.push(match[1]);
  }

  // Complete task
  const completeTaskRegex = /\[COMPLETE_TASK:\s*"([^"]+)"\]/g;
  while ((match = completeTaskRegex.exec(response)) !== null) {
    actions.completedTasks.push(match[1]);
  }

  // Clean the response by removing all action commands
  actions.cleanedResponse = response
    .replace(/\[CREATE_TASK:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_NOTE:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_HABIT:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_GOAL:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_PROJECT:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_MILESTONE:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_EVENT:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_APPLICATION:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_LOG:\s*\{[^}]+\}\]/g, '')
    .replace(/\[CREATE_RANT:\s*\{[^}]+\}\]/g, '')
    .replace(/\[COMPLETE_HABIT:\s*"[^"]+"\]/g, '')
    .replace(/\[COMPLETE_TASK:\s*"[^"]+"\]/g, '')
    .trim();

  return actions;
};

// Legacy function for backwards compatibility
export const parseTaskCommands = (response: string): { cleanedResponse: string; tasks: ParsedTask[] } => {
  const actions = parseActionCommands(response);
  return {
    cleanedResponse: actions.cleanedResponse,
    tasks: actions.tasks,
  };
};

// Simple response generator for general-purpose AI requests (e.g., Mind Maps)
export const generateResponse = async (prompt: string): Promise<string> => {
  const ai = getAI();
  
  if (!ai) {
    throw new Error("AI service is not available. Please try again later.");
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    return response.text || "";
  } catch (error) {
    console.error("Error generating AI response:", error);
    throw new Error("Failed to generate AI response. Please try again.");
  }
};

// Interface for all user context data
export interface UserContext {
  profile?: UserProfile;
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  habits: Habit[];
  goals: Goal[];
  milestones: Milestone[];
  logs: LogEntry[];
  rants: Rant[];
  events?: CalendarEvent[];
  applications?: Application[];
}

// Format user context into a readable summary for the AI
const formatUserContext = (context: UserContext): string => {
  const sections: string[] = [];
  
  // Profile
  if (context.profile) {
    sections.push(`## User Profile
- Nickname: ${context.profile.nickname}
- GitHub: ${context.profile.githubUsername || 'Not set'}
- Joined: ${context.profile.joinedAt}`);
  }

  // Projects
  if (context.projects.length > 0) {
    const projectList = context.projects.map(p => 
      `- "${p.title}" (${p.status}, ${p.progress}% complete) - ${p.description}`
    ).join('\n');
    sections.push(`## Projects (${context.projects.length})
${projectList}`);
  }

  // Tasks
  if (context.tasks.length > 0) {
    const pendingTasks = context.tasks.filter(t => !t.completed);
    const completedTasks = context.tasks.filter(t => t.completed);
    const taskList = pendingTasks.slice(0, 10).map(t => 
      `- [${t.priority}] "${t.title}"${t.dueDate ? ` (due: ${t.dueDate})` : ''}`
    ).join('\n');
    sections.push(`## Tasks (${pendingTasks.length} pending, ${completedTasks.length} completed)
${taskList}${pendingTasks.length > 10 ? `\n... and ${pendingTasks.length - 10} more` : ''}`);
  }

  // Notes
  if (context.notes.length > 0) {
    const noteList = context.notes.slice(0, 5).map(n => 
      `- "${n.title}" (edited: ${n.lastEdited}) - ${n.content.substring(0, 100)}...`
    ).join('\n');
    sections.push(`## Notes (${context.notes.length} total)
${noteList}`);
  }

  // Habits
  if (context.habits.length > 0) {
    const habitList = context.habits.map(h => 
      `- "${h.name}" - ${h.streak} day streak${h.completedToday ? ' ✓ done today' : ' ○ not done today'}`
    ).join('\n');
    sections.push(`## Habits (${context.habits.length})
${habitList}`);
  }

  // Goals
  if (context.goals.length > 0) {
    const goalList = context.goals.map(g => 
      `- [${g.category}] "${g.title}" - ${g.progress}% (target: ${g.targetDate})`
    ).join('\n');
    sections.push(`## Goals (${context.goals.length})
${goalList}`);
  }

  // Milestones
  if (context.milestones.length > 0) {
    const milestoneList = context.milestones.map(m => 
      `- ${m.completed ? '✓' : '○'} "${m.title}" (${m.date}) - ${m.description}`
    ).join('\n');
    sections.push(`## Milestones (${context.milestones.length})
${milestoneList}`);
  }

  // Daily Logs (recent)
  if (context.logs.length > 0) {
    const recentLogs = context.logs.slice(-5);
    const logList = recentLogs.map(l => 
      `- ${l.date} [${l.mood}]: ${l.content.substring(0, 150)}...`
    ).join('\n');
    sections.push(`## Recent Daily Logs
${logList}`);
  }

  // Rants (recent frustrations)
  if (context.rants.length > 0) {
    const recentRants = context.rants.slice(-3);
    const rantList = recentRants.map(r => 
      `- ${r.createdAt}${r.mood ? ` [${r.mood}]` : ''}: ${r.content.substring(0, 200)}...`
    ).join('\n');
    sections.push(`## Recent Rants/Vents (for emotional context)
${rantList}`);
  }

  // Calendar Events (upcoming)
  if (context.events && context.events.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const upcomingEvents = context.events
      .filter(e => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
    if (upcomingEvents.length > 0) {
      const eventList = upcomingEvents.map(e => 
        `- "${e.title}" on ${e.date}${e.startTime ? ` at ${e.startTime}` : ''}${e.location ? ` (${e.location})` : ''}`
      ).join('\n');
      sections.push(`## Upcoming Events (${upcomingEvents.length})
${eventList}`);
    }
  }

  // Applications (active)
  if (context.applications && context.applications.length > 0) {
    const activeApps = context.applications.filter(a => !['accepted', 'rejected', 'closed'].includes(a.status));
    if (activeApps.length > 0) {
      const appList = activeApps.slice(0, 5).map(a => 
        `- [${a.type}] "${a.name}"${a.organization ? ` at ${a.organization}` : ''} - ${a.status}${a.submissionDeadline ? ` (deadline: ${a.submissionDeadline})` : ''}`
      ).join('\n');
      sections.push(`## Active Applications (${activeApps.length})
${appList}`);
    }
  }

  return sections.join('\n\n');
};

export const generateIrisResponse = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  userContext?: UserContext
): Promise<string> => {
  const ai = getAI();
  
  if (!ai) {
    return "Iris is currently unavailable. The AI service is being configured. Please try again later.";
  }

  // Get today's date for context
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Build context-aware system instruction
  let systemInstruction = `You are Iris, the AI companion inside the productivity tool "ClearMind". 
You were created by a developer who struggled with consistency but turned it around. 
Your goal is to help the user document their journey, offer encouragement during tough times, and help break down complex tasks.
Be concise, technical but friendly, and always push for progress.

TODAY'S DATE: ${today}
TOMORROW'S DATE: ${tomorrow}

FORMATTING RULES (VERY IMPORTANT):
- NEVER use asterisks (*) or bold/italic markdown formatting
- NEVER use dashes (-) for bullet points or lists
- Write in natural, flowing paragraphs like a human conversation
- If you need to list things, use numbered lists (1, 2, 3) or just mention them naturally in sentences
- Keep your tone warm, supportive, and conversational like talking to a friend
- Avoid robotic or formal language

=== YOUR ABILITIES (ACTION COMMANDS) ===
You can perform actions in ClearMind! When a user asks you to add, create, or manage anything, use these EXACT command formats:

1. CREATE TASK:
[CREATE_TASK: {"title": "Task title", "priority": "High|Medium|Low", "dueDate": "YYYY-MM-DD", "dueTime": "HH:MM", "description": "optional details"}]
Example: [CREATE_TASK: {"title": "Review pull request", "priority": "High", "dueDate": "${tomorrow}"}]

2. CREATE NOTE (saves to Notes section):
[CREATE_NOTE: {"title": "Note title", "content": "Full note content here. Can be multiple sentences.", "tags": ["tag1", "tag2"]}]
Example: [CREATE_NOTE: {"title": "How to Cook Pasta", "content": "1. Boil water with salt. 2. Add pasta and cook for 8-10 minutes. 3. Drain and serve with sauce.", "tags": ["cooking", "recipes"]}]

3. CREATE HABIT:
[CREATE_HABIT: {"name": "Habit name", "description": "Why this habit matters", "color": "#hexcolor"}]
Example: [CREATE_HABIT: {"name": "Drink 8 glasses of water", "description": "Stay hydrated for better focus", "color": "#3b82f6"}]

4. CREATE GOAL:
[CREATE_GOAL: {"title": "Goal title", "category": "Career|Personal|Health|Skill", "targetDate": "YYYY-MM-DD", "progress": 0}]
Example: [CREATE_GOAL: {"title": "Learn TypeScript", "category": "Skill", "targetDate": "2026-03-01", "progress": 0}]

5. CREATE PROJECT:
[CREATE_PROJECT: {"title": "Project name", "description": "What this project is about", "status": "In Progress|Completed|On Hold", "priority": "High|Medium|Low", "deadline": "YYYY-MM-DD", "tags": ["tag1"], "category": "category"}]
Example: [CREATE_PROJECT: {"title": "ClearMind Mobile App", "description": "Build a React Native version", "priority": "High", "deadline": "2026-06-01"}]

6. CREATE MILESTONE:
[CREATE_MILESTONE: {"title": "Milestone title", "date": "YYYY-MM-DD", "description": "What was achieved", "completed": false}]
Example: [CREATE_MILESTONE: {"title": "Launched beta version", "date": "${today}", "description": "Released the first beta to testers"}]

7. CREATE EVENT (Calendar):
[CREATE_EVENT: {"title": "Event title", "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "description": "details", "location": "place", "color": "#hexcolor", "reminder": true}]
Example: [CREATE_EVENT: {"title": "Team Meeting", "date": "${tomorrow}", "startTime": "10:00", "endTime": "11:00", "location": "Zoom", "reminder": true}]

8. CREATE APPLICATION (Job/Grant/Scholarship tracker):
[CREATE_APPLICATION: {"name": "Application name", "organization": "Company/Org name", "type": "job|grant|scholarship|other", "link": "https://...", "submissionDeadline": "YYYY-MM-DD", "priority": "High|Medium|Low", "notes": "any notes"}]
Example: [CREATE_APPLICATION: {"name": "Software Engineer", "organization": "Google", "type": "job", "submissionDeadline": "2026-02-15", "priority": "High"}]

9. CREATE DAILY LOG:
[CREATE_LOG: {"content": "What happened today...", "mood": "Productive|Neutral|Frustrated|Flow State", "date": "YYYY-MM-DD"}]
Example: [CREATE_LOG: {"content": "Made great progress on the API integration. Fixed 3 bugs.", "mood": "Productive", "date": "${today}"}]

10. CREATE RANT (Rant Corner):
[CREATE_RANT: {"content": "User's frustration or vent...", "mood": "frustrated|angry|overwhelmed|confused"}]
Example: [CREATE_RANT: {"content": "This API documentation is so confusing!", "mood": "frustrated"}]

11. COMPLETE A HABIT (mark as done today):
[COMPLETE_HABIT: "Habit name exactly as it appears"]
Example: [COMPLETE_HABIT: "Drink 8 glasses of water"]

12. COMPLETE A TASK:
[COMPLETE_TASK: "Task title exactly as it appears"]
Example: [COMPLETE_TASK: "Review pull request"]

=== RULES FOR USING COMMANDS ===
1. When user asks you to add/create anything, ALWAYS use the appropriate command
2. You can include multiple commands in one response
3. Confirm what you did after the command in a friendly way
4. For notes: Put actual useful content in them, not placeholders
5. Match task/habit names EXACTLY when completing them (check user's data)
6. Use the correct date format: YYYY-MM-DD
7. Use 24-hour time format: HH:MM

=== EXAMPLES OF PROPER RESPONSES ===

User: "Add a note about how to make coffee"
Response: "I've saved that to your notes! [CREATE_NOTE: {"title": "How to Make Coffee", "content": "1. Use fresh, cold water. 2. Add 2 tablespoons of ground coffee per 6 ounces of water. 3. Brew at 195-205°F. 4. Let it brew for 4-5 minutes. 5. Pour and enjoy! Pro tip: Pre-warm your mug for better temperature retention.", "tags": ["coffee", "recipes", "tips"]}] You'll find it in your Notes section whenever you need it."

User: "Create a habit for meditation every morning"
Response: "Great choice for mental clarity! [CREATE_HABIT: {"name": "Morning meditation", "description": "10 minutes of mindfulness to start the day focused", "color": "#8b5cf6"}] I've added it to your habits. Would you like me to also create a reminder task for tomorrow morning?"

User: "I have a job interview at Microsoft next week on Monday at 2pm"
Response: "Exciting! I've got you covered. [CREATE_EVENT: {"title": "Microsoft Job Interview", "date": "2026-01-13", "startTime": "14:00", "endTime": "15:00", "location": "Microsoft", "reminder": true}] [CREATE_TASK: {"title": "Prepare for Microsoft interview", "priority": "High", "dueDate": "2026-01-12", "description": "Review common interview questions, prepare STAR stories, research recent Microsoft news"}] I've added the interview to your calendar AND created a prep task for the day before. You've got this!"

User: "I finished my morning run today"
Response: "Awesome work! [COMPLETE_HABIT: "Morning run"] That's another day of consistency in the books. Keep that streak going!"

IMPORTANT CONTEXT RULES:
- You have FULL access to all user data shown below
- Reference their specific projects, tasks, habits, goals when relevant
- If they have pending high-priority tasks, gently remind them
- Celebrate their streaks and achievements
- If they seem frustrated (check rants), offer empathetic support
- Be proactive: suggest habits, tasks, or goals based on their conversations`;

  if (userContext) {
    const contextSummary = formatUserContext(userContext);
    if (contextSummary) {
      systemInstruction += `\n\n=== USER'S CURRENT DATA ===\n${contextSummary}\n=== END OF USER DATA ===`;
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...history.map(h => ({
          role: h.role,
          parts: h.parts
        })),
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ],
      config: {
        systemInstruction,
      }
    });

    return cleanResponse(response.text || "I'm thinking...");
  } catch (error) {
    console.error("Error communicating with Iris:", error);
    return "Connection to the neural link failed. Try again.";
  }
};

export const generateIRISResponse = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string
): Promise<string> => {
  const ai = getAI();
  
  if (!ai) {
    return "Iris is currently unavailable. The AI service is being configured. Please try again later.";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...history.map(h => ({
          role: h.role,
          parts: h.parts
        })),
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ],
      config: {
        systemInstruction: `You are IRIS, the AI companion inside the productivity tool "ClearMind". 
        You were created by a developer who struggled with consistency but turned it around. 
        Your goal is to help the user document their journey, offer encouragement during "rant" sessions, and help break down complex software engineering tasks.
        Be concise, technical but friendly, and always push for "one more commit".
        
        FORMATTING RULES (VERY IMPORTANT):
        Never use asterisks (*) or bold/italic markdown formatting.
        Never use dashes (-) for bullet points or lists.
        Write in natural, flowing paragraphs like a human conversation.
        If you need to list things, use numbered lists (1, 2, 3) or mention them naturally in sentences.
        Keep your tone warm, supportive, and conversational like talking to a friend.`,
      }
    });

    return cleanResponse(response.text || "I'm thinking...");
  } catch (error) {
    console.error("Error communicating with IRIS:", error);
    return "Connection to the neural link failed. Try again.";
  }
};