import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, FlatList, TextInput, ActivityIndicator,
} from 'react-native';
import {
  Sparkles, Bot, User, Send, Trash2, Zap, CheckCircle, FileText, Activity,
  Target, BookOpen, Flag, Calendar, Briefcase, MessageSquare,
} from 'lucide-react-native';
import type {
  ChatMessage, IrisConversation, Task, Note, Habit, Goal, Project, Milestone,
  CalendarEvent, Application, LogEntry, Rant, DailyMapperEntry,
  DailyMapperTemplate, UserProfile, ProjectCategory,
} from '@clearmind/shared';
import { dbService, STORES } from '../../services/db';
import { newId } from '../../lib/id';
import {
  generateIrisResponse, parseActionCommands, isApiConfigured,
  type UserContext, type ParsedActions,
} from '../../services/gemini';
import {
  Screen, AppHeader, EmptyState, Spinner, confirmDialog, useToast,
} from '../../components/ui';

const CURRENT_CONVERSATION_ID = 'current-iris-conversation';

const DEFAULT_MESSAGE: ChatMessage = {
  id: 'init',
  role: 'model',
  text:
    "Hello. I am Iris. I'm here to help you maintain consistency and log your journey. I can also add tasks for you, just ask! What are we shipping today?",
  timestamp: new Date(),
};

// ---- Actions summary (mirrors web IrisView) -------------------------------

interface ActionsSummary {
  tasksCreated: string[];
  notesCreated: string[];
  habitsCreated: string[];
  goalsCreated: string[];
  projectsCreated: string[];
  milestonesCreated: string[];
  eventsCreated: string[];
  applicationsCreated: string[];
  logsCreated: string[];
  rantsCreated: string[];
  dailyMapperEntriesCreated: string[];
  habitsCompleted: string[];
  tasksCompleted: string[];
  dailyMapperCompleted: string[];
  dailyMapperUpdated: string[];
  tasksDeleted: string[];
  notesDeleted: string[];
  habitsDeleted: string[];
  goalsDeleted: string[];
  projectsDeleted: string[];
  milestonesDeleted: string[];
  eventsDeleted: string[];
  applicationsDeleted: string[];
  dailyMapperEntriesDeleted: string[];
  duplicatesRemoved: number;
}

const emptySummary = (): ActionsSummary => ({
  tasksCreated: [], notesCreated: [], habitsCreated: [], goalsCreated: [],
  projectsCreated: [], milestonesCreated: [], eventsCreated: [], applicationsCreated: [],
  logsCreated: [], rantsCreated: [], dailyMapperEntriesCreated: [],
  habitsCompleted: [], tasksCompleted: [], dailyMapperCompleted: [], dailyMapperUpdated: [],
  tasksDeleted: [], notesDeleted: [], habitsDeleted: [], goalsDeleted: [],
  projectsDeleted: [], milestonesDeleted: [], eventsDeleted: [], applicationsDeleted: [],
  dailyMapperEntriesDeleted: [], duplicatesRemoved: 0,
});

const hasAnyActions = (s: ActionsSummary): boolean =>
  s.tasksCreated.length > 0 || s.notesCreated.length > 0 || s.habitsCreated.length > 0 ||
  s.goalsCreated.length > 0 || s.projectsCreated.length > 0 || s.milestonesCreated.length > 0 ||
  s.eventsCreated.length > 0 || s.applicationsCreated.length > 0 || s.logsCreated.length > 0 ||
  s.rantsCreated.length > 0 || s.dailyMapperEntriesCreated.length > 0 ||
  s.habitsCompleted.length > 0 || s.tasksCompleted.length > 0 ||
  s.dailyMapperCompleted.length > 0 || s.dailyMapperUpdated.length > 0 ||
  s.tasksDeleted.length > 0 || s.notesDeleted.length > 0 || s.habitsDeleted.length > 0 ||
  s.goalsDeleted.length > 0 || s.projectsDeleted.length > 0 || s.milestonesDeleted.length > 0 ||
  s.eventsDeleted.length > 0 || s.applicationsDeleted.length > 0 ||
  s.dailyMapperEntriesDeleted.length > 0 || s.duplicatesRemoved > 0;

type ChipColor = string;
function summaryChips(s: ActionsSummary): { key: string; label: string; color: ChipColor; icon: 'check' | 'file' | 'activity' | 'target' | 'book' | 'flag' | 'calendar' | 'briefcase' | 'trash' }[] {
  const out: { key: string; label: string; color: ChipColor; icon: any }[] = [];
  const push = (cond: number, label: string, color: string, icon: string) => {
    if (cond > 0) out.push({ key: label, label, color, icon });
  };
  push(s.tasksCreated.length, `${s.tasksCreated.length} task(s) created`, '#60a5fa', 'check');
  push(s.notesCreated.length, `${s.notesCreated.length} note(s) saved`, '#fbbf24', 'file');
  push(s.habitsCreated.length, `${s.habitsCreated.length} habit(s) added`, '#c084fc', 'activity');
  push(s.goalsCreated.length, `${s.goalsCreated.length} goal(s) set`, '#fb923c', 'target');
  push(s.projectsCreated.length, `${s.projectsCreated.length} project(s) created`, '#22d3ee', 'book');
  push(s.milestonesCreated.length, `${s.milestonesCreated.length} milestone(s) added`, '#f472b6', 'flag');
  push(s.eventsCreated.length, `${s.eventsCreated.length} event(s) scheduled`, '#4ade80', 'calendar');
  push(s.applicationsCreated.length, `${s.applicationsCreated.length} application(s) tracked`, '#818cf8', 'briefcase');
  push(s.logsCreated.length, `${s.logsCreated.length} log(s) recorded`, '#a3e635', 'file');
  push(s.rantsCreated.length, `${s.rantsCreated.length} rant(s) saved`, '#f87171', 'file');
  push(s.dailyMapperEntriesCreated.length, `${s.dailyMapperEntriesCreated.length} time block(s) added`, '#22d3ee', 'calendar');
  push(s.habitsCompleted.length, `${s.habitsCompleted.length} habit(s) completed`, '#34d399', 'check');
  push(s.tasksCompleted.length, `${s.tasksCompleted.length} task(s) completed`, '#2dd4bf', 'check');
  push(s.dailyMapperCompleted.length, `${s.dailyMapperCompleted.length} time block(s) completed`, '#a3e635', 'check');
  push(s.dailyMapperUpdated.length, `${s.dailyMapperUpdated.length} time block(s) updated`, '#38bdf8', 'check');
  push(s.tasksDeleted.length, `${s.tasksDeleted.length} task(s) deleted`, '#f87171', 'trash');
  push(s.notesDeleted.length, `${s.notesDeleted.length} note(s) deleted`, '#f87171', 'trash');
  push(s.habitsDeleted.length, `${s.habitsDeleted.length} habit(s) deleted`, '#f87171', 'trash');
  push(s.goalsDeleted.length, `${s.goalsDeleted.length} goal(s) deleted`, '#f87171', 'trash');
  push(s.projectsDeleted.length, `${s.projectsDeleted.length} project(s) deleted`, '#f87171', 'trash');
  push(s.milestonesDeleted.length, `${s.milestonesDeleted.length} milestone(s) deleted`, '#f87171', 'trash');
  push(s.eventsDeleted.length, `${s.eventsDeleted.length} event(s) deleted`, '#f87171', 'trash');
  push(s.applicationsDeleted.length, `${s.applicationsDeleted.length} application(s) deleted`, '#f87171', 'trash');
  push(s.dailyMapperEntriesDeleted.length, `${s.dailyMapperEntriesDeleted.length} time block(s) deleted`, '#f87171', 'trash');
  push(s.duplicatesRemoved, `${s.duplicatesRemoved} duplicate(s) removed`, '#fb923c', 'trash');
  return out;
}

function ChipIcon({ name, color }: { name: string; color: string }) {
  const size = 13;
  switch (name) {
    case 'file': return <FileText size={size} color={color} />;
    case 'activity': return <Activity size={size} color={color} />;
    case 'target': return <Target size={size} color={color} />;
    case 'book': return <BookOpen size={size} color={color} />;
    case 'flag': return <Flag size={size} color={color} />;
    case 'calendar': return <Calendar size={size} color={color} />;
    case 'briefcase': return <Briefcase size={size} color={color} />;
    case 'trash': return <Trash2 size={size} color={color} />;
    default: return <CheckCircle size={size} color={color} />;
  }
}

// ---- Helpers --------------------------------------------------------------

const todayStr = () => new Date().toISOString().split('T')[0];

function formatTime(value: Date | string): string {
  const d = new Date(value);
  try {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

const getNextTaskNumber = async (): Promise<number> => {
  const allTasks = await dbService.getAll<Task>(STORES.TASKS);
  return allTasks.reduce((max, t) => Math.max(max, t.taskNumber || 0), 0) + 1;
};

// Execute every action Iris requested. Ported from web IrisView.executeActions,
// using newId() for ids and dbService.put/delete/hardDelete for persistence.
async function executeActions(actions: ParsedActions): Promise<ActionsSummary> {
  const summary = emptySummary();
  const now = () => new Date().toISOString();

  for (const task of actions.tasks) {
    const taskNumber = await getNextTaskNumber();
    const newTask: Task = {
      id: newId(),
      title: task.title,
      completed: false,
      priority: task.priority,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      description: task.description,
      taskNumber,
      notified: false,
    };
    await dbService.put(STORES.TASKS, newTask);
    summary.tasksCreated.push(task.title);
  }

  for (const note of actions.notes) {
    const newNote: Note = {
      id: newId(),
      title: note.title,
      content: note.content,
      tags: note.tags || [],
      lastEdited: now(),
    };
    await dbService.put(STORES.NOTES, newNote);
    summary.notesCreated.push(note.title);
  }

  for (const habit of actions.habits) {
    const newHabit: Habit = {
      id: newId(),
      name: habit.name,
      description: habit.description,
      color: habit.color || '#3b82f6',
      streak: 0,
      completedToday: false,
      history: [false, false, false, false, false, false, false],
      monthlyHistory: {},
      createdAt: now(),
    };
    await dbService.put(STORES.HABITS, newHabit);
    summary.habitsCreated.push(habit.name);
  }

  for (const goal of actions.goals) {
    const newGoal: Goal = {
      id: newId(),
      title: goal.title,
      category: goal.category,
      targetDate: goal.targetDate,
      progress: goal.progress || 0,
    };
    await dbService.put(STORES.GOALS, newGoal);
    summary.goalsCreated.push(goal.title);
  }

  for (const project of actions.projects) {
    const newProject: Project = {
      id: newId(),
      title: project.title,
      description: project.description,
      status: project.status || 'In Progress',
      progress: 0,
      priority: project.priority || 'Medium',
      deadline: project.deadline,
      tags: project.tags || [],
      category: project.category as ProjectCategory,
    };
    await dbService.put(STORES.PROJECTS, newProject);
    summary.projectsCreated.push(project.title);
  }

  for (const milestone of actions.milestones) {
    const newMilestone: Milestone = {
      id: newId(),
      title: milestone.title,
      date: milestone.date,
      description: milestone.description,
      completed: milestone.completed || false,
    };
    await dbService.put(STORES.MILESTONES, newMilestone);
    summary.milestonesCreated.push(milestone.title);
  }

  for (const event of actions.events) {
    const newEvent: CalendarEvent = {
      id: newId(),
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      description: event.description,
      location: event.location,
      color: event.color || '#3b82f6',
      reminder: event.reminder !== false,
      notified: false,
    };
    await dbService.put(STORES.EVENTS, newEvent);
    summary.eventsCreated.push(event.title);
  }

  for (const app of actions.applications) {
    const newApplication: Application = {
      id: newId(),
      name: app.name,
      organization: app.organization,
      type: app.type,
      status: 'open',
      link: app.link,
      submissionDeadline: app.submissionDeadline,
      openingDate: app.openingDate,
      closingDate: app.closingDate,
      priority: app.priority || 'Medium',
      notes: app.notes,
      createdAt: now(),
    };
    await dbService.put(STORES.APPLICATIONS, newApplication);
    summary.applicationsCreated.push(app.name);
  }

  for (const log of actions.logs) {
    const newLog: LogEntry = {
      id: newId(),
      date: log.date || todayStr(),
      content: log.content,
      mood: log.mood,
    };
    await dbService.put(STORES.LOGS, newLog);
    summary.logsCreated.push(log.content.slice(0, 30) + '...');
  }

  for (const rant of actions.rants) {
    const newRant: Rant = {
      id: newId(),
      content: rant.content,
      mood: rant.mood,
      createdAt: now(),
    };
    await dbService.put(STORES.RANTS, newRant);
    summary.rantsCreated.push(rant.content.slice(0, 30) + '...');
  }

  const today = todayStr();
  for (const entry of actions.dailyMapperEntries) {
    let templateId: string | undefined;
    if (entry.makePermanent) {
      const newTemplate: DailyMapperTemplate = {
        id: newId(),
        startTime: entry.startTime,
        endTime: entry.endTime,
        task: entry.task,
        color: entry.color || '#3B82F6',
        location: entry.location,
        permanentType: entry.permanentType || 'daily',
        createdAt: now(),
      };
      await dbService.put(STORES.DAILY_MAPPER_TEMPLATES, newTemplate);
      templateId = newTemplate.id;
    }
    const newEntry: DailyMapperEntry = {
      id: newId(),
      date: entry.date || today,
      startTime: entry.startTime,
      endTime: entry.endTime,
      task: entry.task,
      completed: entry.completed || 'no',
      color: entry.color || '#3B82F6',
      location: entry.location,
      isPermanent: entry.makePermanent || false,
      permanentType: entry.makePermanent ? entry.permanentType : undefined,
      templateId,
    };
    await dbService.put(STORES.DAILY_MAPPER, newEntry);
    summary.dailyMapperEntriesCreated.push(entry.task);
  }

  const allDailyMapperEntries = await dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER);
  for (const update of actions.dailyMapperUpdates) {
    const dateToFind = update.date || today;
    const entry = allDailyMapperEntries.find(
      (e) => e.task.toLowerCase() === update.task.toLowerCase() && e.date === dateToFind,
    );
    if (entry) {
      const updatedEntry: DailyMapperEntry = {
        ...entry,
        completed: update.completed || entry.completed,
        comment: update.comment || entry.comment,
      };
      await dbService.put(STORES.DAILY_MAPPER, updatedEntry);
      summary.dailyMapperUpdated.push(entry.task);
    }
  }

  for (const taskName of actions.completedDailyMapperTasks) {
    const entry = allDailyMapperEntries.find(
      (e) => e.task.toLowerCase() === taskName.toLowerCase() && e.date === today && e.completed !== 'yes',
    );
    if (entry) {
      await dbService.put(STORES.DAILY_MAPPER, { ...entry, completed: 'yes' });
      summary.dailyMapperCompleted.push(entry.task);
    }
  }

  const allHabits = await dbService.getAll<Habit>(STORES.HABITS);
  for (const habitName of actions.completedHabits) {
    const habit = allHabits.find((h) => h.name.toLowerCase() === habitName.toLowerCase());
    if (habit && !habit.completedToday) {
      const updatedHabit: Habit = {
        ...habit,
        completedToday: true,
        streak: habit.streak + 1,
        history: [true, ...habit.history.slice(0, 6)],
        monthlyHistory: { ...habit.monthlyHistory, [today]: true },
      };
      await dbService.put(STORES.HABITS, updatedHabit);
      summary.habitsCompleted.push(habit.name);
    }
  }

  const allTasks = await dbService.getAll<Task>(STORES.TASKS);
  for (const taskTitle of actions.completedTasks) {
    const task = allTasks.find((t) => t.title.toLowerCase() === taskTitle.toLowerCase() && !t.completed);
    if (task) {
      await dbService.put(STORES.TASKS, { ...task, completed: true });
      summary.tasksCompleted.push(task.title);
    }
  }

  for (const taskTitle of actions.deletedTasks) {
    const task = allTasks.find((t) => t.title.toLowerCase() === taskTitle.toLowerCase());
    if (task) {
      await dbService.delete(STORES.TASKS, task.id);
      summary.tasksDeleted.push(task.title);
    }
  }

  const allNotes = await dbService.getAll<Note>(STORES.NOTES);
  for (const noteTitle of actions.deletedNotes) {
    const note = allNotes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase());
    if (note) {
      await dbService.delete(STORES.NOTES, note.id);
      summary.notesDeleted.push(note.title);
    }
  }

  for (const habitName of actions.deletedHabits) {
    const habit = allHabits.find((h) => h.name.toLowerCase() === habitName.toLowerCase());
    if (habit) {
      await dbService.delete(STORES.HABITS, habit.id);
      summary.habitsDeleted.push(habit.name);
    }
  }

  const allGoals = await dbService.getAll<Goal>(STORES.GOALS);
  for (const goalTitle of actions.deletedGoals) {
    const goal = allGoals.find((g) => g.title.toLowerCase() === goalTitle.toLowerCase());
    if (goal) {
      await dbService.delete(STORES.GOALS, goal.id);
      summary.goalsDeleted.push(goal.title);
    }
  }

  const allProjects = await dbService.getAll<Project>(STORES.PROJECTS);
  for (const projectTitle of actions.deletedProjects) {
    const project = allProjects.find((p) => p.title.toLowerCase() === projectTitle.toLowerCase());
    if (project) {
      await dbService.delete(STORES.PROJECTS, project.id);
      summary.projectsDeleted.push(project.title);
    }
  }

  const allMilestones = await dbService.getAll<Milestone>(STORES.MILESTONES);
  for (const milestoneTitle of actions.deletedMilestones) {
    const milestone = allMilestones.find((m) => m.title.toLowerCase() === milestoneTitle.toLowerCase());
    if (milestone) {
      await dbService.delete(STORES.MILESTONES, milestone.id);
      summary.milestonesDeleted.push(milestone.title);
    }
  }

  const allEvents = await dbService.getAll<CalendarEvent>(STORES.EVENTS);
  for (const eventTitle of actions.deletedEvents) {
    const event = allEvents.find((e) => e.title.toLowerCase() === eventTitle.toLowerCase());
    if (event) {
      await dbService.delete(STORES.EVENTS, event.id);
      summary.eventsDeleted.push(event.title);
    }
  }

  const allApplications = await dbService.getAll<Application>(STORES.APPLICATIONS);
  for (const appName of actions.deletedApplications) {
    const app = allApplications.find((a) => a.name.toLowerCase() === appName.toLowerCase());
    if (app) {
      await dbService.delete(STORES.APPLICATIONS, app.id);
      summary.applicationsDeleted.push(app.name);
    }
  }

  const allTemplates = await dbService.getAll<DailyMapperTemplate>(STORES.DAILY_MAPPER_TEMPLATES);
  for (const taskName of actions.deletedDailyMapperEntries) {
    const entriesToDelete = allDailyMapperEntries.filter((e) => e.task.toLowerCase() === taskName.toLowerCase());
    for (const entry of entriesToDelete) {
      await dbService.delete(STORES.DAILY_MAPPER, entry.id);
      summary.dailyMapperEntriesDeleted.push(entry.task);
      if (entry.templateId) {
        const template = allTemplates.find((t) => t.id === entry.templateId);
        if (template) {
          await dbService.hardDelete(STORES.DAILY_MAPPER_TEMPLATES, template.id);
        }
      }
    }
  }

  if (actions.deleteDuplicateDailyMapper) {
    const entryGroups = new Map<string, DailyMapperEntry[]>();
    for (const entry of allDailyMapperEntries) {
      const key = `${entry.date}-${entry.startTime}-${entry.endTime}-${entry.task}`;
      if (!entryGroups.has(key)) entryGroups.set(key, []);
      entryGroups.get(key)!.push(entry);
    }
    for (const [, entries] of entryGroups) {
      if (entries.length > 1) {
        for (let i = 1; i < entries.length; i++) {
          await dbService.delete(STORES.DAILY_MAPPER, entries[i].id);
          summary.duplicatesRemoved++;
        }
      }
    }
  }

  return summary;
}

// ---- Screen ---------------------------------------------------------------

export default function IrisScreen() {
  const toast = useToast();
  const apiReady = isApiConfigured();

  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [actionsSummary, setActionsSummary] = useState<ActionsSummary | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const summaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConversation = useCallback(async () => {
    try {
      const saved = await dbService.get<IrisConversation>(STORES.IRIS_CONVERSATIONS, CURRENT_CONVERSATION_ID);
      if (saved && saved.messages.length > 0) {
        // timestamps are stored as ISO strings in sqlite — revive to Date for display.
        setMessages(saved.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
      }
    } catch (e) {
      console.error('Failed to load conversation:', e);
    } finally {
      setIsLoadingConversation(false);
    }
  }, []);

  const saveConversation = useCallback(async (newMessages: ChatMessage[]) => {
    try {
      const conversation: IrisConversation = {
        id: CURRENT_CONVERSATION_ID,
        messages: newMessages, // JSON.stringify serialises Date -> ISO string in sqlite
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: newMessages.length > 1 ? newMessages[1]?.text?.slice(0, 50) : 'New Conversation',
      };
      await dbService.put(STORES.IRIS_CONVERSATIONS, conversation);
    } catch (e) {
      console.error('Failed to save conversation:', e);
    }
  }, []);

  const fetchUserContext = useCallback(async () => {
    try {
      const [projects, tasks, notes, habits, goals, milestones, logs, rants, events, applications, dailyMapperEntries, dailyMapperTemplates] =
        await Promise.all([
          dbService.getAll<Project>(STORES.PROJECTS),
          dbService.getAll<Task>(STORES.TASKS),
          dbService.getAll<Note>(STORES.NOTES),
          dbService.getAll<Habit>(STORES.HABITS),
          dbService.getAll<Goal>(STORES.GOALS),
          dbService.getAll<Milestone>(STORES.MILESTONES),
          dbService.getAll<LogEntry>(STORES.LOGS),
          dbService.getAll<Rant>(STORES.RANTS),
          dbService.getAll<CalendarEvent>(STORES.EVENTS),
          dbService.getAll<Application>(STORES.APPLICATIONS),
          dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER),
          dbService.getAll<DailyMapperTemplate>(STORES.DAILY_MAPPER_TEMPLATES),
        ]);

      let profile: UserProfile | undefined;
      try {
        profile = await dbService.get<UserProfile>(STORES.PROFILE, 'user');
      } catch {
        profile = undefined;
      }

      setUserContext({
        profile, projects, tasks, notes, habits, goals, milestones, logs, rants,
        events, applications, dailyMapperEntries, dailyMapperTemplates,
      });
    } catch (e) {
      console.error('Failed to fetch user context:', e);
    }
  }, []);

  useEffect(() => {
    loadConversation();
    fetchUserContext();
    return () => {
      if (summaryTimer.current) clearTimeout(summaryTimer.current);
    };
  }, [loadConversation, fetchUserContext]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const clearConversation = async () => {
    const ok = await confirmDialog({
      title: 'Clear conversation',
      message: 'Clear the conversation history? Iris will forget everything discussed.',
      confirmText: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    const fresh = [{ ...DEFAULT_MESSAGE, timestamp: new Date() }];
    setMessages(fresh);
    setActionsSummary(null);
    await saveConversation(fresh);
    toast.show('Conversation cleared', 'info');
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = { id: newId(), role: 'user', text, timestamp: new Date() };

    // History excludes the synthetic greeting so the sent turns start with a user role.
    const history = messages
      .filter((m) => m.id !== 'init')
      .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setActionsSummary(null);
    if (summaryTimer.current) clearTimeout(summaryTimer.current);

    try {
      const responseText = await generateIrisResponse(history, text, userContext || undefined);

      const actions = parseActionCommands(responseText);
      const summary = await executeActions(actions);

      if (hasAnyActions(summary)) {
        setActionsSummary(summary);
        summaryTimer.current = setTimeout(() => setActionsSummary(null), 8000);
      }

      fetchUserContext();

      const aiMsg: ChatMessage = {
        id: newId(),
        role: 'model',
        text: actions.cleanedResponse || 'Done — updated your workspace.',
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const next = [...prev, aiMsg];
        saveConversation(next);
        return next;
      });
    } catch (e) {
      console.error(e);
      const errMsg: ChatMessage = {
        id: newId(),
        role: 'model',
        text: "I'm having trouble connecting right now. Take a breath and try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const next = [...prev, errMsg];
        saveConversation(next);
        return next;
      });
    } finally {
      setIsTyping(false);
    }
  };

  if (!apiReady) {
    return (
      <Screen padded={false}>
        <AppHeader title="Iris" subtitle="Your AI co-pilot for the journey" />
        <EmptyState
          icon={<Sparkles size={40} color="#a855f7" />}
          title="AI not configured"
          subtitle="Add your Gemini API key (EXPO_PUBLIC_GEMINI_API_KEY) to chat with Iris and let her act on your ClearMind workspace."
        />
      </Screen>
    );
  }

  const chips = actionsSummary ? summaryChips(actionsSummary) : [];

  return (
    <Screen padded={false}>
      <AppHeader
        title="Iris"
        subtitle="Your AI co-pilot for the journey"
        right={
          <View className="flex-row items-center">
            <View className="flex-row items-center mr-3">
              <MessageSquare size={12} color="#9ca3af" />
              <Text className="text-ink-muted text-xs ml-1">{Math.max(messages.length - 1, 0)}</Text>
            </View>
            <Pressable onPress={clearConversation} hitSlop={8} className="p-1.5 active:opacity-60">
              <Trash2 size={18} color="#9ca3af" />
            </Pressable>
          </View>
        }
      />

      {chips.length > 0 && (
        <View className="mx-4 mt-3 p-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <View className="flex-row items-center mb-2">
            <Zap size={16} color="#34d399" />
            <Text className="text-emerald-400 text-sm font-semibold ml-2">Iris performed actions on your workspace</Text>
          </View>
          <View className="flex-row flex-wrap">
            {chips.map((c) => (
              <View key={c.key} className="flex-row items-center bg-midnight-light rounded-full px-2.5 py-1 mr-2 mb-2">
                <ChipIcon name={c.icon} color={c.color} />
                <Text className="text-ink-muted text-xs ml-1.5">{c.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {isLoadingConversation ? (
        <Spinner label="Loading conversation…" />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View className="h-4" />}
          onContentSizeChange={scrollToEnd}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListFooterComponent={isTyping ? <TypingIndicator /> : null}
        />
      )}

      <View className="flex-row items-end px-3 py-3 border-t border-hairline bg-midnight">
        <View className="flex-1 bg-midnight-light border border-hairline rounded-2xl px-4 py-1 mr-2">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Iris for guidance or document a thought…"
            placeholderTextColor="#6b7280"
            multiline
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
            className="text-ink text-base py-2"
            style={{ maxHeight: 120 }}
          />
        </View>
        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || isTyping}
          className={`w-12 h-12 rounded-full items-center justify-center ${!input.trim() || isTyping ? 'bg-midnight-lighter opacity-50' : 'bg-accent active:bg-accent-hover'}`}
        >
          {isTyping ? <ActivityIndicator color="#fff" /> : <Send size={20} color="#fff" />}
        </Pressable>
      </View>

      <Text className="text-ink-muted text-[11px] text-center pb-2">
        Iris can read your workspace and take actions for you. AI responses can vary.
      </Text>
    </Screen>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View className={`flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <View className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/40 items-center justify-center mr-2 mt-0.5">
          <Bot size={16} color="#c084fc" />
        </View>
      )}
      <View
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser ? 'bg-accent rounded-tr-sm' : 'bg-midnight-light border border-hairline rounded-tl-sm'
        }`}
      >
        <Text className={`text-[15px] leading-relaxed ${isUser ? 'text-white' : 'text-ink'}`}>{message.text}</Text>
        <Text className={`text-[10px] mt-1.5 ${isUser ? 'text-white/60' : 'text-ink-muted'}`}>{formatTime(message.timestamp)}</Text>
      </View>
      {isUser && (
        <View className="w-8 h-8 rounded-full bg-accent/20 border border-accent/40 items-center justify-center ml-2 mt-0.5">
          <User size={16} color="#60a5fa" />
        </View>
      )}
    </View>
  );
}

function TypingIndicator() {
  return (
    <View className="flex-row items-center mt-4">
      <View className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/40 items-center justify-center mr-2">
        <Bot size={16} color="#c084fc" />
      </View>
      <View className="bg-midnight-light border border-hairline rounded-2xl rounded-tl-sm px-4 py-3 flex-row items-center">
        <ActivityIndicator color="#9ca3af" size="small" />
        <Text className="text-ink-muted text-sm ml-2">Iris is thinking…</Text>
      </View>
    </View>
  );
}
