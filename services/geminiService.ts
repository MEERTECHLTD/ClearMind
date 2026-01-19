import { GoogleGenAI } from "@google/genai";
import { Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, CalendarEvent, Application, DailyMapperEntry, DailyMapperTemplate } from '../types';

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

// Interface for parsed daily mapper entry
export interface ParsedDailyMapperEntry {
  task: string;
  startTime: string;
  endTime: string;
  date?: string; // defaults to today
  location?: 'home' | 'work' | 'other';
  color?: string;
  completed?: 'yes' | 'no' | 'partial';
  makePermanent?: boolean;
  permanentType?: 'daily' | 'workday' | 'weekend';
}

// Interface for updating daily mapper entry
export interface ParsedDailyMapperUpdate {
  task: string; // task name to find
  date?: string; // date to find (defaults to today)
  completed?: 'yes' | 'no' | 'partial';
  comment?: string;
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
  dailyMapperEntries: ParsedDailyMapperEntry[]; // daily mapper entries to create
  dailyMapperUpdates: ParsedDailyMapperUpdate[]; // daily mapper entries to update
  completedHabits: string[]; // habit names to mark as completed
  completedTasks: string[]; // task titles to mark as completed
  completedDailyMapperTasks: string[]; // daily mapper task names to mark as completed
  // Deletion actions
  deletedTasks: string[]; // task titles to delete
  deletedNotes: string[]; // note titles to delete
  deletedHabits: string[]; // habit names to delete
  deletedGoals: string[]; // goal titles to delete
  deletedProjects: string[]; // project titles to delete
  deletedMilestones: string[]; // milestone titles to delete
  deletedEvents: string[]; // event titles to delete
  deletedApplications: string[]; // application names to delete
  deletedDailyMapperEntries: string[]; // daily mapper task names to delete (can be "all duplicates" or specific task names)
  deleteDuplicateDailyMapper: boolean; // special flag to delete all duplicate daily mapper entries
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
    dailyMapperEntries: [],
    dailyMapperUpdates: [],
    completedHabits: [],
    completedTasks: [],
    completedDailyMapperTasks: [],
    deletedTasks: [],
    deletedNotes: [],
    deletedHabits: [],
    deletedGoals: [],
    deletedProjects: [],
    deletedMilestones: [],
    deletedEvents: [],
    deletedApplications: [],
    deletedDailyMapperEntries: [],
    deleteDuplicateDailyMapper: false,
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

  // Daily Mapper entry creation
  const dailyMapperRegex = /\[CREATE_DAILY_MAPPER:\s*(\{[^}]+\})\]/g;
  while ((match = dailyMapperRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.dailyMapperEntries.push({
        task: data.task || 'New Time Block',
        startTime: data.startTime || '08:00',
        endTime: data.endTime || '09:00',
        date: data.date,
        location: ['home', 'work', 'other'].includes(data.location) ? data.location : 'home',
        color: data.color || '#3B82F6',
        completed: ['yes', 'no', 'partial'].includes(data.completed) ? data.completed : 'no',
        makePermanent: data.makePermanent || false,
        permanentType: ['daily', 'workday', 'weekend'].includes(data.permanentType) ? data.permanentType : 'daily',
      });
    } catch (e) {
      console.error('Failed to parse daily mapper command:', e);
    }
  }

  // Daily Mapper entry update
  const dailyMapperUpdateRegex = /\[UPDATE_DAILY_MAPPER:\s*(\{[^}]+\})\]/g;
  while ((match = dailyMapperUpdateRegex.exec(response)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      actions.dailyMapperUpdates.push({
        task: data.task,
        date: data.date,
        completed: ['yes', 'no', 'partial'].includes(data.completed) ? data.completed : undefined,
        comment: data.comment,
      });
    } catch (e) {
      console.error('Failed to parse daily mapper update command:', e);
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

  // Complete daily mapper task
  const completeDailyMapperRegex = /\[COMPLETE_DAILY_MAPPER:\s*"([^"]+)"\]/g;
  while ((match = completeDailyMapperRegex.exec(response)) !== null) {
    actions.completedDailyMapperTasks.push(match[1]);
  }

  // Delete commands
  const deleteTaskRegex = /\[DELETE_TASK:\s*"([^"]+)"\]/g;
  while ((match = deleteTaskRegex.exec(response)) !== null) {
    actions.deletedTasks.push(match[1]);
  }

  const deleteNoteRegex = /\[DELETE_NOTE:\s*"([^"]+)"\]/g;
  while ((match = deleteNoteRegex.exec(response)) !== null) {
    actions.deletedNotes.push(match[1]);
  }

  const deleteHabitRegex = /\[DELETE_HABIT:\s*"([^"]+)"\]/g;
  while ((match = deleteHabitRegex.exec(response)) !== null) {
    actions.deletedHabits.push(match[1]);
  }

  const deleteGoalRegex = /\[DELETE_GOAL:\s*"([^"]+)"\]/g;
  while ((match = deleteGoalRegex.exec(response)) !== null) {
    actions.deletedGoals.push(match[1]);
  }

  const deleteProjectRegex = /\[DELETE_PROJECT:\s*"([^"]+)"\]/g;
  while ((match = deleteProjectRegex.exec(response)) !== null) {
    actions.deletedProjects.push(match[1]);
  }

  const deleteMilestoneRegex = /\[DELETE_MILESTONE:\s*"([^"]+)"\]/g;
  while ((match = deleteMilestoneRegex.exec(response)) !== null) {
    actions.deletedMilestones.push(match[1]);
  }

  const deleteEventRegex = /\[DELETE_EVENT:\s*"([^"]+)"\]/g;
  while ((match = deleteEventRegex.exec(response)) !== null) {
    actions.deletedEvents.push(match[1]);
  }

  const deleteApplicationRegex = /\[DELETE_APPLICATION:\s*"([^"]+)"\]/g;
  while ((match = deleteApplicationRegex.exec(response)) !== null) {
    actions.deletedApplications.push(match[1]);
  }

  const deleteDailyMapperRegex = /\[DELETE_DAILY_MAPPER:\s*"([^"]+)"\]/g;
  while ((match = deleteDailyMapperRegex.exec(response)) !== null) {
    actions.deletedDailyMapperEntries.push(match[1]);
  }

  // Special command to delete all duplicate daily mapper entries
  if (/\[DELETE_DUPLICATE_DAILY_MAPPER\]/.test(response)) {
    actions.deleteDuplicateDailyMapper = true;
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
    .replace(/\[CREATE_DAILY_MAPPER:\s*\{[^}]+\}\]/g, '')
    .replace(/\[UPDATE_DAILY_MAPPER:\s*\{[^}]+\}\]/g, '')
    .replace(/\[COMPLETE_HABIT:\s*"[^"]+"\]/g, '')
    .replace(/\[COMPLETE_TASK:\s*"[^"]+"\]/g, '')
    .replace(/\[COMPLETE_DAILY_MAPPER:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_TASK:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_NOTE:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_HABIT:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_GOAL:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_PROJECT:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_MILESTONE:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_EVENT:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_APPLICATION:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_DAILY_MAPPER:\s*"[^"]+"\]/g, '')
    .replace(/\[DELETE_DUPLICATE_DAILY_MAPPER\]/g, '')
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
  dailyMapperEntries?: DailyMapperEntry[];
  dailyMapperTemplates?: DailyMapperTemplate[];
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

  // Daily Mapper (today's schedule and recent entries)
  if (context.dailyMapperEntries && context.dailyMapperEntries.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const todayEntries = context.dailyMapperEntries
      .filter(e => e.date === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    if (todayEntries.length > 0) {
      const entryList = todayEntries.map(e => {
        const status = e.completed === 'yes' ? '✓' : e.completed === 'partial' ? '◐' : '○';
        const location = e.location ? ` [${e.location}]` : '';
        const permanent = e.isPermanent ? ' (permanent)' : '';
        return `- ${status} ${e.startTime}-${e.endTime}: "${e.task}"${location}${permanent}`;
      }).join('\n');
      sections.push(`## Today's Daily Mapper Schedule (${todayEntries.length} time blocks)
${entryList}`);
    }

    // Show recent entries from other days
    const recentEntries = context.dailyMapperEntries
      .filter(e => e.date !== today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
    
    if (recentEntries.length > 0) {
      const recentList = recentEntries.map(e => {
        const status = e.completed === 'yes' ? '✓' : e.completed === 'partial' ? '◐' : '○';
        return `- ${status} ${e.date} ${e.startTime}-${e.endTime}: "${e.task}"`;
      }).join('\n');
      sections.push(`## Recent Daily Mapper Entries
${recentList}`);
    }
  }

  // Daily Mapper Templates (permanent/recurring todos)
  if (context.dailyMapperTemplates && context.dailyMapperTemplates.length > 0) {
    const templateList = context.dailyMapperTemplates.map(t => {
      const typeLabel = t.permanentType === 'daily' ? 'Every Day' : t.permanentType === 'workday' ? 'Workdays' : 'Weekends';
      const location = t.location ? ` [${t.location}]` : '';
      return `- ${t.startTime}-${t.endTime}: "${t.task}" (${typeLabel})${location}`;
    }).join('\n');
    sections.push(`## Permanent Daily Mapper Templates (${context.dailyMapperTemplates.length})
${templateList}`);
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

=== DAILY MAPPER COMMANDS (Daily To-Do Schedule) ===
The Daily Mapper is for time-blocked daily schedules. Users plan their day with specific time slots.

11. CREATE DAILY MAPPER ENTRY (add a time block to the daily schedule):
[CREATE_DAILY_MAPPER: {"task": "Task name", "startTime": "HH:MM", "endTime": "HH:MM", "date": "YYYY-MM-DD", "location": "home|work|other", "color": "#hexcolor", "makePermanent": false, "permanentType": "daily|workday|weekend"}]
Example: [CREATE_DAILY_MAPPER: {"task": "Morning workout", "startTime": "06:00", "endTime": "07:00", "date": "${today}", "location": "home"}]
Example with permanent: [CREATE_DAILY_MAPPER: {"task": "Daily standup", "startTime": "09:00", "endTime": "09:30", "location": "work", "makePermanent": true, "permanentType": "workday"}]

12. UPDATE DAILY MAPPER ENTRY (update completion status or add comment):
[UPDATE_DAILY_MAPPER: {"task": "Task name exactly as it appears", "date": "YYYY-MM-DD", "completed": "yes|no|partial", "comment": "optional comment"}]
Example: [UPDATE_DAILY_MAPPER: {"task": "Morning workout", "completed": "yes", "comment": "Did 30 minutes cardio"}]

13. COMPLETE DAILY MAPPER ENTRY (quick way to mark as done):
[COMPLETE_DAILY_MAPPER: "Task name exactly as it appears"]
Example: [COMPLETE_DAILY_MAPPER: "Morning workout"]

=== OTHER COMPLETION COMMANDS ===

14. COMPLETE A HABIT (mark as done today):
[COMPLETE_HABIT: "Habit name exactly as it appears"]
Example: [COMPLETE_HABIT: "Drink 8 glasses of water"]

15. COMPLETE A TASK:
[COMPLETE_TASK: "Task title exactly as it appears"]
Example: [COMPLETE_TASK: "Review pull request"]

=== DELETE COMMANDS ===
You can also DELETE items when the user asks. Use exact titles/names:

16. DELETE A TASK:
[DELETE_TASK: "Task title exactly as it appears"]
Example: [DELETE_TASK: "Old task I don't need"]

17. DELETE A NOTE:
[DELETE_NOTE: "Note title exactly as it appears"]
Example: [DELETE_NOTE: "Outdated meeting notes"]

18. DELETE A HABIT:
[DELETE_HABIT: "Habit name exactly as it appears"]
Example: [DELETE_HABIT: "Old habit"]

19. DELETE A GOAL:
[DELETE_GOAL: "Goal title exactly as it appears"]
Example: [DELETE_GOAL: "Cancelled project goal"]

20. DELETE A PROJECT:
[DELETE_PROJECT: "Project title exactly as it appears"]
Example: [DELETE_PROJECT: "Abandoned project"]

21. DELETE A MILESTONE:
[DELETE_MILESTONE: "Milestone title exactly as it appears"]
Example: [DELETE_MILESTONE: "Old milestone"]

22. DELETE AN EVENT:
[DELETE_EVENT: "Event title exactly as it appears"]
Example: [DELETE_EVENT: "Cancelled meeting"]

23. DELETE AN APPLICATION:
[DELETE_APPLICATION: "Application name exactly as it appears"]
Example: [DELETE_APPLICATION: "Job I withdrew from"]

24. DELETE A DAILY MAPPER ENTRY (from Daily To-Do Mapper):
[DELETE_DAILY_MAPPER: "Task name exactly as it appears"]
Example: [DELETE_DAILY_MAPPER: "Morning review"]

25. DELETE ALL DUPLICATE DAILY MAPPER ENTRIES (removes duplicates, keeps one of each):
[DELETE_DUPLICATE_DAILY_MAPPER]
Use this when user complains about repeated/duplicate entries in Daily Mapper. This will automatically find and remove duplicate entries that have the same time and task name, keeping only one instance of each.

=== RULES FOR USING COMMANDS ===
1. When user asks you to add/create anything, ALWAYS use the appropriate command
2. When user asks you to delete/remove anything, use the appropriate DELETE command
3. You can include multiple commands in one response
4. Confirm what you did after the command in a friendly way
5. For notes: Put actual useful content in them, not placeholders
6. Match task/habit names EXACTLY when completing or deleting them (check user's data)
7. Use the correct date format: YYYY-MM-DD
8. Use 24-hour time format: HH:MM
9. When user mentions duplicate entries in Daily Mapper, use [DELETE_DUPLICATE_DAILY_MAPPER] to clean them up

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