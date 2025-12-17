# 🌐 ClearMind

> **Your AI-Powered Personal Productivity Companion**

🌐 **Live Demo:** [clearmind.meertech.tech](https://clearmind.meertech.tech)

ClearMind is a modern, feature-rich productivity application designed for developers and creators who want to stay organized, track their progress, and maintain mental clarity. Built with React, TypeScript, and powered by Google's Gemini AI.

![ClearMind](https://img.shields.io/badge/Version-0.0.0-blue)
![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite)

---

## ✨ Features

### 📊 **Dashboard**
A comprehensive overview of your productivity metrics, active projects, and daily goals at a glance.

### 📁 **Projects**
Manage your projects with status tracking, progress indicators, and customizable tags.

### ✅ **Tasks**
Priority-based task management with due dates and completion tracking.

### 📝 **Notes**
A flexible note-taking system with tags and search functionality.

### 🔥 **Habits**
Build and maintain habits with streak tracking and 7-day history visualization.

### 🎯 **Goals**
Set and track goals across different categories: Career, Personal, Health, and Skills.

### 🏆 **Milestones**
Celebrate your achievements by documenting key milestones in your journey.

### 📖 **Daily Log**
Journal your daily experiences with mood tracking (Productive, Neutral, Frustrated, Flow State).

### 📈 **Analytics**
Visualize your productivity trends and patterns with beautiful charts powered by Recharts.

### 🤖 **Iris - AI Companion**
Your personal AI assistant powered by Google Gemini. Iris helps you:
- Break down complex tasks
- Provide encouragement and motivation
- Document your development journey
- Stay focused with the "one more commit" philosophy

### 💬 **Rant Corner**
A safe space to vent your frustrations with AI-powered emotional support.

### ⚙️ **Settings**
Customize your experience with theme preferences and profile management.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI Framework |
| **TypeScript** | Type Safety |
| **Vite** | Build Tool & Dev Server |
| **Tailwind CSS** | Styling |
| **IndexedDB** | Local Data Persistence |
| **Google Gemini AI** | AI-Powered Features |
| **Recharts** | Data Visualization |
| **Lucide React** | Icons |
| **PWA** | Progressive Web App Support |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Gemini API Key (for AI features)

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
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to `http://localhost:3000`

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
│   ├── Sidebar.tsx          # Navigation sidebar
│   ├── TopBar.tsx            # Top navigation bar
│   └── views/
│       ├── DashboardView.tsx
│       ├── ProjectsView.tsx
│       ├── TasksView.tsx
│       ├── NotesView.tsx
│       ├── HabitsView.tsx
│       ├── GoalsView.tsx
│       ├── MilestonesView.tsx
│       ├── DailyLogView.tsx
│       ├── AnalyticsView.tsx
│       ├── IrisView.tsx       # AI Companion
│       ├── IRISView.tsx
│       ├── RantCorner.tsx     # Vent with AI support
│       ├── SettingsView.tsx
│       └── OnboardingView.tsx
├── services/
│   ├── db.ts                  # IndexedDB service
│   └── geminiService.ts       # Google Gemini AI integration
├── App.tsx                    # Main application component
├── index.tsx                  # Entry point
├── index.html                 # HTML template
├── types.ts                   # TypeScript type definitions
├── vite.config.ts             # Vite configuration
├── manifest.json              # PWA manifest
└── sw.js                      # Service Worker
```

---

## 🌐 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Add your environment variables in Vercel's dashboard:
   - `GEMINI_API_KEY`: Your Google Gemini API key
4. Deploy!

### Other Platforms

ClearMind can be deployed to any static hosting platform that supports Vite:
- Netlify
- GitHub Pages
- Cloudflare Pages
- Firebase Hosting

---

## 🔐 Data Privacy

ClearMind stores all your data **locally** in your browser using IndexedDB. Your notes, tasks, habits, and journals never leave your device unless you choose to sync them.

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