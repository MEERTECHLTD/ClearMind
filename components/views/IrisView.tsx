import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateIrisResponse, UserContext, parseActionCommands, ParsedActions } from '../../services/geminiService';
import { dbService, STORES } from '../../services/db';
import { createTask, toggleTask, deleteTask, createProject, updateProject } from '../tasks/actions';
import { getStore } from '../tasks/store';
import { ChatMessage, Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, CalendarEvent, Application, IrisConversation, ProjectCategory, DailyMapperEntry, DailyMapperTemplate } from '../../types';
import { Send, Bot, User, CheckCircle, Trash2, MessageSquare, FileText, Target, Calendar, Briefcase, Activity, Flag, BookOpen, Zap } from 'lucide-react';
import { cx, Card, IconBtn, inputCls } from '../ui-kit';

const CURRENT_CONVERSATION_ID = 'current-iris-conversation';

// Track what actions were performed for notification
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
  // Deletion tracking
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

const IrisView: React.FC = () => {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [actionsSummary, setActionsSummary] = useState<ActionsSummary | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  
  const defaultMessage: ChatMessage = {
    id: 'init',
    role: 'model',
    text: "Hello. I am Iris. I'm here to help you maintain consistency and log your journey. I can also add tasks for you, just ask! What are we shipping today?",
    timestamp: new Date()
  };
  
  const [messages, setMessages] = useState<ChatMessage[]>([defaultMessage]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load conversation from storage
  const loadConversation = useCallback(async () => {
    try {
      const savedConversation = await dbService.get<IrisConversation>(STORES.IRIS_CONVERSATIONS, CURRENT_CONVERSATION_ID);
      if (savedConversation && savedConversation.messages.length > 0) {
        // Parse dates back from strings
        const messagesWithDates = savedConversation.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(messagesWithDates);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setIsLoadingConversation(false);
    }
  }, []);

  // Save conversation to storage
  const saveConversation = useCallback(async (newMessages: ChatMessage[]) => {
    try {
      const conversation: IrisConversation = {
        id: CURRENT_CONVERSATION_ID,
        messages: newMessages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: newMessages.length > 1 ? newMessages[1]?.text?.slice(0, 50) : 'New Conversation'
      };
      await dbService.put(STORES.IRIS_CONVERSATIONS, conversation);
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }, []);

  // Clear conversation history
  const clearConversation = async () => {
    if (!confirm('Are you sure you want to clear the conversation history? Iris will forget everything discussed.')) return;
    
    const freshMessages = [defaultMessage];
    setMessages(freshMessages);
    await saveConversation(freshMessages);
  };

  // Helper to generate unique ID
  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);


  // Execute all actions from Iris's response
  const executeActions = async (actions: ParsedActions): Promise<ActionsSummary> => {
    const summary: ActionsSummary = {
      tasksCreated: [],
      notesCreated: [],
      habitsCreated: [],
      goalsCreated: [],
      projectsCreated: [],
      milestonesCreated: [],
      eventsCreated: [],
      applicationsCreated: [],
      logsCreated: [],
      rantsCreated: [],
      dailyMapperEntriesCreated: [],
      habitsCompleted: [],
      tasksCompleted: [],
      dailyMapperCompleted: [],
      dailyMapperUpdated: [],
      tasksDeleted: [],
      notesDeleted: [],
      habitsDeleted: [],
      goalsDeleted: [],
      projectsDeleted: [],
      milestonesDeleted: [],
      eventsDeleted: [],
      applicationsDeleted: [],
      dailyMapperEntriesDeleted: [],
      duplicatesRemoved: 0,
    };

    // Tasks and projects go through the shared domain layer (same as Quick Add /
    // the sidebar): numbering, default reminders, recurrence roll-forward,
    // completion records, activity and cascade deletes.
    await Promise.all([STORES.TASKS, STORES.PROJECTS, STORES.COMPLETIONS, STORES.PREFERENCES, STORES.SECTIONS, STORES.LABELS].map((n) => {
      const st = getStore(n);
      return st.getSnapshot().loaded ? undefined : st.load();
    }));

    // Create Tasks
    for (const task of actions.tasks) {
      try {
        createTask({ title: task.title, description: task.description, dueDate: task.dueDate || null, dueTime: task.dueTime || null, priority: task.priority });
        summary.tasksCreated.push(task.title);
      } catch (e) {
        console.warn('Iris could not create task', task.title, e);
      }
    }

    // Create Notes
    for (const note of actions.notes) {
      const newNote: Note = {
        id: generateId(),
        title: note.title,
        content: note.content,
        tags: note.tags || [],
        lastEdited: new Date().toISOString(),
      };
      await dbService.put(STORES.NOTES, newNote);
      summary.notesCreated.push(note.title);
    }

    // Create Habits
    for (const habit of actions.habits) {
      const newHabit: Habit = {
        id: generateId(),
        name: habit.name,
        description: habit.description,
        color: habit.color || '#3b82f6',
        streak: 0,
        completedToday: false,
        history: [false, false, false, false, false, false, false],
        monthlyHistory: {},
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.HABITS, newHabit);
      summary.habitsCreated.push(habit.name);
    }

    // Create Goals
    for (const goal of actions.goals) {
      const newGoal: Goal = {
        id: generateId(),
        title: goal.title,
        category: goal.category,
        targetDate: goal.targetDate,
        progress: goal.progress || 0,
      };
      await dbService.put(STORES.GOALS, newGoal);
      summary.goalsCreated.push(goal.title);
    }

    // Create Projects (one record for tasks + plan)
    for (const project of actions.projects) {
      try {
        const created = createProject({ title: project.title });
        updateProject(created, {
          description: project.description || '',
          status: project.status || 'In Progress',
          priority: project.priority || 'Medium',
          deadline: project.deadline,
          tags: project.tags || [],
          category: project.category as ProjectCategory,
        });
        summary.projectsCreated.push(project.title);
      } catch (e) {
        console.warn('Iris could not create project', project.title, e);
      }
    }

    // Create Milestones
    for (const milestone of actions.milestones) {
      const newMilestone: Milestone = {
        id: generateId(),
        title: milestone.title,
        date: milestone.date,
        description: milestone.description,
        completed: milestone.completed || false,
      };
      await dbService.put(STORES.MILESTONES, newMilestone);
      summary.milestonesCreated.push(milestone.title);
    }

    // Create Events
    for (const event of actions.events) {
      const newEvent: CalendarEvent = {
        id: generateId(),
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

    // Create Applications
    for (const app of actions.applications) {
      const newApplication: Application = {
        id: generateId(),
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
        funder: app.funder,
        awardAmount: app.awardAmount,
        referenceNumber: app.referenceNumber,
        tags: app.tags,
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.APPLICATIONS, newApplication);
      summary.applicationsCreated.push(app.name);
    }

    // Create Daily Logs
    for (const log of actions.logs) {
      const newLog: LogEntry = {
        id: generateId(),
        date: log.date || new Date().toISOString().split('T')[0],
        content: log.content,
        mood: log.mood,
      };
      await dbService.put(STORES.LOGS, newLog);
      summary.logsCreated.push(log.content.slice(0, 30) + '...');
    }

    // Create Rants
    for (const rant of actions.rants) {
      const newRant: Rant = {
        id: generateId(),
        content: rant.content,
        mood: rant.mood,
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.RANTS, newRant);
      summary.rantsCreated.push(rant.content.slice(0, 30) + '...');
    }

    // Create Daily Mapper Entries
    const today = new Date().toISOString().split('T')[0];
    for (const entry of actions.dailyMapperEntries) {
      let templateId: string | undefined;
      
      // If making permanent, create template first
      if (entry.makePermanent) {
        const newTemplate: DailyMapperTemplate = {
          id: generateId(),
          startTime: entry.startTime,
          endTime: entry.endTime,
          task: entry.task,
          color: entry.color || '#3B82F6',
          location: entry.location,
          permanentType: entry.permanentType || 'daily',
          createdAt: new Date().toISOString()
        };
        await dbService.put(STORES.DAILY_MAPPER_TEMPLATES, newTemplate);
        templateId = newTemplate.id;
      }
      
      const newEntry: DailyMapperEntry = {
        id: generateId(),
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

    // Update Daily Mapper Entries
    const allDailyMapperEntries = await dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER);
    for (const update of actions.dailyMapperUpdates) {
      const dateToFind = update.date || today;
      const entry = allDailyMapperEntries.find(
        e => e.task.toLowerCase() === update.task.toLowerCase() && e.date === dateToFind
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

    // Complete Daily Mapper Tasks (quick complete)
    for (const taskName of actions.completedDailyMapperTasks) {
      const entry = allDailyMapperEntries.find(
        e => e.task.toLowerCase() === taskName.toLowerCase() && e.date === today && e.completed !== 'yes'
      );
      if (entry) {
        const updatedEntry: DailyMapperEntry = { ...entry, completed: 'yes' };
        await dbService.put(STORES.DAILY_MAPPER, updatedEntry);
        summary.dailyMapperCompleted.push(entry.task);
      }
    }

    // Complete Habits
    const allHabits = await dbService.getAll<Habit>(STORES.HABITS);
    for (const habitName of actions.completedHabits) {
      const habit = allHabits.find(h => h.name.toLowerCase() === habitName.toLowerCase());
      if (habit && !habit.completedToday) {
        const today = new Date().toISOString().split('T')[0];
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

    // Complete Tasks
    const liveTasks = () => getStore<Task>(STORES.TASKS).getSnapshot().items.filter((t) => !t.deleted);
    for (const taskTitle of actions.completedTasks) {
      const task = liveTasks().find(t => t.title.toLowerCase() === taskTitle.toLowerCase() && !t.completed);
      if (task) {
        toggleTask(task);
        summary.tasksCompleted.push(task.title);
      }
    }

    // Delete Tasks
    for (const taskTitle of actions.deletedTasks) {
      const task = liveTasks().find(t => t.title.toLowerCase() === taskTitle.toLowerCase());
      if (task) {
        deleteTask(task);
        summary.tasksDeleted.push(task.title);
      }
    }

    // Delete Notes
    const allNotes = await dbService.getAll<Note>(STORES.NOTES);
    for (const noteTitle of actions.deletedNotes) {
      const note = allNotes.find(n => n.title.toLowerCase() === noteTitle.toLowerCase());
      if (note) {
        await dbService.delete(STORES.NOTES, note.id);
        summary.notesDeleted.push(note.title);
      }
    }

    // Delete Habits
    for (const habitName of actions.deletedHabits) {
      const habit = allHabits.find(h => h.name.toLowerCase() === habitName.toLowerCase());
      if (habit) {
        await dbService.delete(STORES.HABITS, habit.id);
        summary.habitsDeleted.push(habit.name);
      }
    }

    // Delete Goals
    const allGoals = await dbService.getAll<Goal>(STORES.GOALS);
    for (const goalTitle of actions.deletedGoals) {
      const goal = allGoals.find(g => g.title.toLowerCase() === goalTitle.toLowerCase());
      if (goal) {
        await dbService.delete(STORES.GOALS, goal.id);
        summary.goalsDeleted.push(goal.title);
      }
    }

    // Delete Projects
    const allProjects = await dbService.getAll<Project>(STORES.PROJECTS);
    for (const projectTitle of actions.deletedProjects) {
      const project = allProjects.find(p => p.title.toLowerCase() === projectTitle.toLowerCase());
      if (project) {
        await dbService.delete(STORES.PROJECTS, project.id);
        summary.projectsDeleted.push(project.title);
      }
    }

    // Delete Milestones
    const allMilestones = await dbService.getAll<Milestone>(STORES.MILESTONES);
    for (const milestoneTitle of actions.deletedMilestones) {
      const milestone = allMilestones.find(m => m.title.toLowerCase() === milestoneTitle.toLowerCase());
      if (milestone) {
        await dbService.delete(STORES.MILESTONES, milestone.id);
        summary.milestonesDeleted.push(milestone.title);
      }
    }

    // Delete Events
    const allEvents = await dbService.getAll<CalendarEvent>(STORES.EVENTS);
    for (const eventTitle of actions.deletedEvents) {
      const event = allEvents.find(e => e.title.toLowerCase() === eventTitle.toLowerCase());
      if (event) {
        await dbService.delete(STORES.EVENTS, event.id);
        summary.eventsDeleted.push(event.title);
      }
    }

    // Delete Applications
    const allApplications = await dbService.getAll<Application>(STORES.APPLICATIONS);
    for (const appName of actions.deletedApplications) {
      const app = allApplications.find(a => a.name.toLowerCase() === appName.toLowerCase());
      if (app) {
        await dbService.delete(STORES.APPLICATIONS, app.id);
        summary.applicationsDeleted.push(app.name);
      }
    }

    // Delete Daily Mapper Entries (reuse allDailyMapperEntries from earlier)
    // Also delete associated templates to prevent them from recreating
    const allTemplates = await dbService.getAll<DailyMapperTemplate>(STORES.DAILY_MAPPER_TEMPLATES);
    for (const taskName of actions.deletedDailyMapperEntries) {
      const entriesToDelete = allDailyMapperEntries.filter(e => e.task.toLowerCase() === taskName.toLowerCase());
      for (const entry of entriesToDelete) {
        await dbService.delete(STORES.DAILY_MAPPER, entry.id);
        summary.dailyMapperEntriesDeleted.push(entry.task);
        
        // If this entry has a templateId, delete the template too
        if (entry.templateId) {
          const template = allTemplates.find(t => t.id === entry.templateId);
          if (template) {
            await dbService.hardDelete(STORES.DAILY_MAPPER_TEMPLATES, template.id);
          }
        }
      }
    }

    // Delete Duplicate Daily Mapper Entries
    if (actions.deleteDuplicateDailyMapper) {
      // Group entries by date + startTime + endTime + task
      const entryGroups = new Map<string, DailyMapperEntry[]>();
      for (const entry of allDailyMapperEntries) {
        const key = `${entry.date}-${entry.startTime}-${entry.endTime}-${entry.task}`;
        if (!entryGroups.has(key)) {
          entryGroups.set(key, []);
        }
        entryGroups.get(key)!.push(entry);
      }

      // Delete duplicates (keep the first one of each group)
      for (const [, entries] of entryGroups) {
        if (entries.length > 1) {
          // Keep the first entry, delete the rest
          for (let i = 1; i < entries.length; i++) {
            await dbService.delete(STORES.DAILY_MAPPER, entries[i].id);
            summary.duplicatesRemoved++;
          }
        }
      }
    }

    return summary;
  };

  // Check if any actions were performed
  const hasAnyActions = (summary: ActionsSummary): boolean => {
    return (
      summary.tasksCreated.length > 0 ||
      summary.notesCreated.length > 0 ||
      summary.habitsCreated.length > 0 ||
      summary.goalsCreated.length > 0 ||
      summary.projectsCreated.length > 0 ||
      summary.milestonesCreated.length > 0 ||
      summary.eventsCreated.length > 0 ||
      summary.applicationsCreated.length > 0 ||
      summary.logsCreated.length > 0 ||
      summary.rantsCreated.length > 0 ||
      summary.dailyMapperEntriesCreated.length > 0 ||
      summary.habitsCompleted.length > 0 ||
      summary.tasksCompleted.length > 0 ||
      summary.dailyMapperCompleted.length > 0 ||
      summary.dailyMapperUpdated.length > 0 ||
      summary.tasksDeleted.length > 0 ||
      summary.notesDeleted.length > 0 ||
      summary.habitsDeleted.length > 0 ||
      summary.goalsDeleted.length > 0 ||
      summary.projectsDeleted.length > 0 ||
      summary.milestonesDeleted.length > 0 ||
      summary.eventsDeleted.length > 0 ||
      summary.applicationsDeleted.length > 0 ||
      summary.dailyMapperEntriesDeleted.length > 0 ||
      summary.duplicatesRemoved > 0
    );
  };

  // Fetch all user data for context
  const fetchUserContext = useCallback(async () => {
    try {
      const [projects, tasks, notes, habits, goals, milestones, logs, rants, events, applications, dailyMapperEntries, dailyMapperTemplates] = await Promise.all([
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
        profile,
        projects,
        tasks,
        notes,
        habits,
        goals,
        milestones,
        logs,
        rants,
        events,
        applications,
        dailyMapperEntries,
        dailyMapperTemplates,
      });
    } catch (error) {
      console.error('Failed to fetch user context:', error);
    }
  }, []);

  // Load conversation and user context on mount
  useEffect(() => {
    loadConversation();
    fetchUserContext();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'iris_conversations') {
        loadConversation();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, [loadConversation, fetchUserContext]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setActionsSummary(null);

    try {
      // Format history for Gemini
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const responseText = await generateIrisResponse(history, userMsg.text, userContext || undefined);

      // Parse for all action commands
      const actions = parseActionCommands(responseText);
      
      // Execute all actions that Iris requested
      const summary = await executeActions(actions);
      
      // Show notification if any actions were performed
      if (hasAnyActions(summary)) {
        setActionsSummary(summary);
        setTimeout(() => setActionsSummary(null), 8000);
      }

      // Refresh context after each interaction
      fetchUserContext();

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: actions.cleanedResponse,
        timestamp: new Date()
      };
      
      // Update messages and save to storage
      setMessages(prev => {
        const newMessages = [...prev, userMsg, aiMsg];
        saveConversation(newMessages);
        return newMessages;
      });
    } catch (error) {
      console.error(error);
      // Still save the user message even if AI fails
      setMessages(prev => {
        const newMessages = [...prev];
        saveConversation(newMessages);
        return newMessages;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const summaryItems = (s: ActionsSummary): { key: string; n: number; label: string; icon: React.ReactNode; danger?: boolean }[] => [
    { key: 'tc', n: s.tasksCreated.length, label: 'task(s) created', icon: <CheckCircle size={14} /> },
    { key: 'nc', n: s.notesCreated.length, label: 'note(s) saved', icon: <FileText size={14} /> },
    { key: 'hc', n: s.habitsCreated.length, label: 'habit(s) added', icon: <Activity size={14} /> },
    { key: 'gc', n: s.goalsCreated.length, label: 'goal(s) set', icon: <Target size={14} /> },
    { key: 'pc', n: s.projectsCreated.length, label: 'project(s) created', icon: <BookOpen size={14} /> },
    { key: 'mc', n: s.milestonesCreated.length, label: 'milestone(s) added', icon: <Flag size={14} /> },
    { key: 'ec', n: s.eventsCreated.length, label: 'event(s) scheduled', icon: <Calendar size={14} /> },
    { key: 'ac', n: s.applicationsCreated.length, label: 'application(s) tracked', icon: <Briefcase size={14} /> },
    { key: 'hd', n: s.habitsCompleted.length, label: 'habit(s) completed', icon: <CheckCircle size={14} /> },
    { key: 'td', n: s.tasksCompleted.length, label: 'task(s) completed', icon: <CheckCircle size={14} /> },
    { key: 'dc', n: s.dailyMapperEntriesCreated.length, label: 'time block(s) added', icon: <Calendar size={14} /> },
    { key: 'dd', n: s.dailyMapperCompleted.length, label: 'time block(s) completed', icon: <CheckCircle size={14} /> },
    { key: 'du', n: s.dailyMapperUpdated.length, label: 'time block(s) updated', icon: <CheckCircle size={14} /> },
    { key: 'tx', n: s.tasksDeleted.length, label: 'task(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'nx', n: s.notesDeleted.length, label: 'note(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'hx', n: s.habitsDeleted.length, label: 'habit(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'gx', n: s.goalsDeleted.length, label: 'goal(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'px', n: s.projectsDeleted.length, label: 'project(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'mx', n: s.milestonesDeleted.length, label: 'milestone(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'ex', n: s.eventsDeleted.length, label: 'event(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'ax', n: s.applicationsDeleted.length, label: 'application(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'dx', n: s.dailyMapperEntriesDeleted.length, label: 'daily mapper entry(s) deleted', icon: <Trash2 size={14} />, danger: true },
    { key: 'dup', n: s.duplicatesRemoved, label: 'duplicate(s) removed', icon: <Trash2 size={14} />, danger: true },
  ];

  const assistantAvatar = (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" aria-hidden>
      <Bot size={16} />
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-[#05050A]">
      {/* Header */}
      <div className="shrink-0">
        <header className="max-w-3xl mx-auto px-4 sm:px-8 pt-6 pb-3 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <h1 className={`text-2xl font-bold truncate ${cx.text}`}>Iris</h1>
            <p className={`text-sm mt-0.5 ${cx.muted}`}>Your AI co-pilot for the journey.</p>
          </div>
          <span className={`text-xs flex items-center gap-1 ${cx.muted}`}>
            <MessageSquare size={14} />
            {messages.length - 1} messages
          </span>
          <IconBtn label="Clear conversation history" danger onClick={clearConversation}>
            <Trash2 size={18} />
          </IconBtn>
        </header>

        {/* Actions Performed Notification */}
        {actionsSummary && hasAnyActions(actionsSummary) && (
          <div className="max-w-3xl mx-auto px-4 sm:px-8 pb-2">
            <Card className="animate-fade-in" title="Iris performed actions" right={<Zap size={16} className="text-green-600 dark:text-green-400" aria-hidden />}>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5 text-xs" role="status" aria-live="polite">
                {summaryItems(actionsSummary).filter((i) => i.n > 0).map((i) => (
                  <li key={i.key} className={`flex items-center gap-1.5 ${i.danger ? 'text-red-500 dark:text-red-400' : cx.text}`}>
                    <span className={i.danger ? '' : 'text-green-600 dark:text-green-400'}>{i.icon}</span>
                    <span>{i.n} {i.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-4 space-y-5 h-full">
          {isLoadingConversation ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className={`text-sm ${cx.muted}`}>Loading conversation…</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {msg.role === 'model' ? assistantAvatar : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300" aria-hidden>
                    <User size={16} />
                  </div>
                )}

                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-md'
                    : `${cx.card} border ${cx.border} ${cx.text} rounded-tl-md`
                  }`}>
                  {msg.text}
                </div>
              </div>
            ))
          )}
          {isTyping && (
            <div className="flex gap-3" aria-live="polite" aria-label="Iris is typing">
              {assistantAvatar}
              <div className={`${cx.card} border ${cx.border} px-4 py-3 rounded-2xl rounded-tl-md flex items-center gap-1.5`}>
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className={`shrink-0 border-t ${cx.border}`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-3 pb-4">
          <div className="relative">
            <label htmlFor="iris-input" className="sr-only">Message Iris</label>
            <input
              id="iris-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask Iris for guidance or document a thought..."
              className={`${inputCls} !py-3 !pl-4 !pr-12 !rounded-xl`}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              title="Send message"
              aria-label="Send message"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
          <p className={`text-center text-xs mt-2 ${cx.faint}`}>Iris helps you stay consistent. AI responses can vary.</p>
        </div>
      </div>
    </div>
  );
};

export default IrisView;
