# 🧠 ClearMind

> **Your AI-Powered Personal Productivity Companion**

🌐 **Live Demo:** [clearmind.meertech.tech](https://clearmind.meertech.tech)

ClearMind is a comprehensive, feature-rich productivity application designed for developers, professionals, and creators who want to stay organized, track their progress, and maintain mental clarity. Built with React 19, TypeScript, and powered by Google's Gemini AI with optional Firebase cloud sync.

![ClearMind](https://img.shields.io/badge/Version-1.0.0-blue)
![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite)
![Firebase](https://img.shields.io/badge/Firebase-12.7-FFCA28?logo=firebase)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa)

---

## ✨ Features

### 📊 **Dashboard**
A comprehensive overview of your productivity metrics, active projects, upcoming tasks, and daily goals at a glance. See your progress across all areas in one beautiful interface.

### 📁 **Projects** *(Enterprise-Grade)*
Full-featured project management with professional capabilities:
- **16 Project Categories**: Energy, Green Energy, Finance, Health, IT, Education, Construction, Manufacturing, Retail, Marketing, Research, Government, Non-Profit, Startup, Personal, and Other
- **Implementation Plans**: Define project phases, objectives, scope, and constraints
- **Phase Management**: Track phases with status (Not Started, In Progress, Completed, Blocked)
- **Team Check-ins**: Log team meetings with attendees, notes, blockers, and next steps
- **Risk Management**: Track risks with severity, likelihood, and mitigation strategies
- **Resource & Budget Tracking**: Monitor budget allocation, personnel, equipment, and software
- **Performance Metrics**: Define KPIs with targets, current values, and trend tracking
- **Strategic Alignment**: Connect projects to strategic goals with alignment scores
- **Project Templates**: Quick-start projects with pre-defined phases and structures
- **Health Status Tracking**: At-a-glance project health (On Track, At Risk, Off Track)

### ✅ **Tasks**
Priority-based task management with powerful features:
- **Priority Levels**: High, Medium, Low with visual indicators
- **Due Dates & Times**: Schedule tasks with specific deadlines
- **Task Numbering**: Automatic sequential task numbering
- **Notifications**: Browser notifications for upcoming tasks
- **Sorting Options**: Sort by default, priority (high/low), or date
- **In-line Editing**: Quick edit tasks without modal dialogs
- **Task Descriptions**: Add detailed descriptions to any task

### 📝 **Notes**
A flexible note-taking system with:
- Tag-based organization
- Full-text search functionality
- Rich text content
- Last edited timestamps

### 🔥 **Habits**
Build and maintain habits with comprehensive tracking:
- **Streak Tracking**: Maintain daily streaks
- **7-Day History**: Visual weekly completion history
- **Monthly Calendar View**: Full month visualization with interactive day toggles
- **Custom Colors**: Personalize habits with 8 color options
- **Descriptions**: Add context to each habit

### 📅 **Calendar**
Full-featured event management:
- **Monthly Calendar View**: Navigate months with ease
- **Event Creation**: Add events with title, description, time, and location
- **Color Coding**: 8 color options for event categorization
- **Reminders**: Set reminders for important events
- **Time Slots**: Define start and end times

### ⏰ **Daily Mapper**
Plan your day with precision:
- **Time Block Planning**: Map out your entire day in 30-minute increments
- **Preset Time Slots**: Quick-add common time blocks (Morning Routine, Work Blocks, etc.)
- **Completion Tracking**: Mark tasks as Yes, No, or Partial
- **Comments & Adjustments**: Add notes and track schedule changes
- **Day Navigation**: Easy navigation between days
- **Copy Previous Day**: Replicate yesterday's schedule

### 🎯 **Goals**
Set and track goals across different categories:
- Career Goals
- Personal Goals
- Health Goals
- Skill Development

### 🏆 **Milestones**
Celebrate your achievements by documenting key milestones in your journey with completion tracking.

### 📖 **Daily Log**
Journal your daily experiences with mood tracking:
- Productive 🚀
- Neutral 😐
- Frustrated 😤
- Flow State 🎯

### 📈 **Analytics**
Visualize your productivity trends and patterns:
- Beautiful charts powered by Recharts
- Task completion trends
- Habit streak analysis
- Project progress visualization

### 🧠 **Mind Maps**
Create visual mind maps and decision trees to organize your thoughts:
- **Mind Maps**: Brainstorm ideas with connected nodes
- **Decision Trees**: Map out choices with Yes/No branches
- **AI Generation**: Let Gemini AI create comprehensive mind maps from a topic
- **Interactive Canvas**: Pan, zoom, and drag nodes freely
- **Color-coded Nodes**: Organize visually with different colors
- **Labeled Connections**: Add context to relationships between ideas

### 📋 **Applications Tracker**
Track job applications, grants, scholarships, and more:
- **Application Types**: Job, Grant, Scholarship, Other
- **Status Tracking**: Draft, Open, Submitted, Closed, Accepted, Rejected
- **Priority Levels**: High, Medium, Low
- **Important Dates**: Opening date, closing date, submission deadline
- **Organization Tracking**: Keep track of where you applied
- **Sorting & Grouping**: Sort by deadline, priority, created date, or name
- **Group Views**: Group by type, status, or priority
- **Persistent Preferences**: Your sorting and grouping preferences are saved

### 🤖 **Iris - AI Companion**
Your personal AI assistant powered by Google Gemini:
- Break down complex tasks
- Provide encouragement and motivation
- Document your development journey
- Stay focused with the "one more commit" philosophy
- Conversation history preservation

### 💬 **Rant Corner**
A safe space to vent your frustrations:
- AI-powered emotional support
- Mood tracking (Frustrated, Angry, Overwhelmed, Confused)
- Private and secure venting

### 🔐 **Authentication & Cloud Sync**
Flexible authentication options:
- **Local Mode**: Use ClearMind offline with local storage only
- **Cloud Sync**: Optional Firebase integration for cross-device sync
- **Multiple Sign-in Methods**:
  - Email/Password with email verification
  - Google Sign-In
  - GitHub Sign-In
  - Anonymous accounts
- **Real-time Sync**: Changes sync instantly across devices
- **Password Reset**: Self-service password recovery

### ⚙️ **Settings**
Customize your experience:
- Theme preferences (Dark/Light mode)
- Profile management
- Account settings
- Cloud sync configuration

### 📱 **Progressive Web App (PWA)**
Install ClearMind on any device:
- Offline support with service workers
- Install prompt on desktop and mobile
- Native app-like experience
- Automatic updates

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI Framework with Suspense & Lazy Loading |
| **TypeScript 5.8** | Type Safety |
| **Vite 6.2** | Build Tool & Dev Server |
| **Tailwind CSS** | Styling |
| **IndexedDB** | Local Data Persistence |
| **Firebase 12.7** | Authentication & Cloud Sync |
| **Google Gemini AI** | AI-Powered Features |
| **Recharts 3.6** | Data Visualization |
| **Lucide React** | Icons |
| **PWA** | Progressive Web App Support |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Gemini API Key (for AI features)
- Firebase Project (optional, for cloud sync)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MEERTECHLTD/ClearMind.git
   cd ClearMind
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Required for AI features
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   
   # Optional - Firebase (for cloud sync)
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The build output will be in the `dist` folder.

### Preview Production Build

```bash
npm run preview
```

---

## 📁 Project Structure

```
ClearMind/
├── components/
│   ├── Sidebar.tsx           # Navigation sidebar
│   ├── TopBar.tsx            # Top navigation bar
│   └── views/
│       ├── DashboardView.tsx     # Main dashboard
│       ├── ProjectsView.tsx      # Enterprise project management
│       ├── TasksView.tsx         # Task management
│       ├── NotesView.tsx         # Notes system
│       ├── HabitsView.tsx        # Habit tracking
│       ├── GoalsView.tsx         # Goal setting
│       ├── MilestonesView.tsx    # Achievement tracking
│       ├── DailyLogView.tsx      # Daily journaling
│       ├── AnalyticsView.tsx     # Data visualization
│       ├── CalendarView.tsx      # Event calendar
│       ├── DailyMapperView.tsx   # Day planning
│       ├── ApplicationsView.tsx  # Application tracker
│       ├── IrisView.tsx          # AI Companion
│       ├── MindMapView.tsx       # Mind Maps & Decision Trees
│       ├── RantCorner.tsx        # Vent with AI support
│       ├── AuthView.tsx          # Authentication
│       ├── SettingsView.tsx      # User settings
│       └── OnboardingView.tsx    # First-time setup
├── services/
│   ├── db.ts                 # IndexedDB service
│   ├── firebase.ts           # Firebase Auth & Firestore
│   └── geminiService.ts      # Google Gemini AI integration
├── utils/
│   └── projectTemplates.ts   # Project template definitions
├── public/
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service Worker
│   └── widgets/              # PWA widgets
├── App.tsx                   # Main application component
├── index.tsx                 # Entry point
├── types.ts                  # TypeScript type definitions
├── vite.config.ts            # Vite configuration
└── vercel.json               # Vercel deployment config
```

---

## 🌐 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Add your environment variables in Vercel's dashboard:
   - `VITE_GEMINI_API_KEY`: Your Google Gemini API key
   - Firebase variables (if using cloud sync)
4. Deploy!

### Other Platforms

ClearMind can be deployed to any static hosting platform that supports Vite:
- Netlify
- GitHub Pages
- Cloudflare Pages
- Firebase Hosting

---

## 🔐 Data Privacy

ClearMind offers flexible data storage options:

- **Local Mode**: All data stored locally in your browser using IndexedDB. Your data never leaves your device.
- **Cloud Sync**: Optional Firebase integration encrypts and syncs your data across devices. You control when to enable this.

---

## 🆕 Recent Updates

### Version 1.0.0
- ✅ **Enterprise Project Management**: Full implementation plans, phases, risks, resources, and metrics
- ✅ **Calendar View**: Complete event management with reminders
- ✅ **Daily Mapper**: Time-block planning for daily productivity
- ✅ **Applications Tracker**: Track jobs, grants, scholarships with full lifecycle management
- ✅ **Firebase Cloud Sync**: Real-time cross-device synchronization
- ✅ **Multiple Auth Methods**: Email, Google, GitHub, and anonymous sign-in
- ✅ **Monthly Habit Calendar**: Full month view with interactive tracking
- ✅ **Task Enhancements**: Sorting, filtering, descriptions, and notifications
- ✅ **PWA Improvements**: Better offline support and install experience
- ✅ **Performance**: Lazy loading for all views with code splitting
- ✅ **16 Project Categories**: Industry-specific categorization

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is proprietary software developed by **MeerTech Ltd**.

---

## 🙏 Acknowledgments

- Built with ❤️ by [MeerTech Ltd](https://github.com/MEERTECHLTD)
- Powered by [Google Gemini AI](https://deepmind.google/technologies/gemini/)
- UI components inspired by modern productivity tools

---

<p align="center">
  <strong>ClearMind</strong> - Stay Clear. Stay Focused. Ship More.
</p>