# 🛡️ LegalGuard — Chrome Extension for AI-Powered Legal Risk Detection

[![Built with Chrome AI APIs](https://img.shields.io/badge/Built%20with-Chrome%20AI%20APIs-blue?logo=googlechrome)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)]()
[![Status](https://img.shields.io/badge/Status-Early%20Access-orange)]()

> **LegalGuard** automatically detects, summarizes, and explains legal terms on any webpage — helping users understand what they're agreeing to before clicking *"Accept."*

---

## 🌍 Overview

Every year, an average internet user encounters **1,400+ privacy notices** and terms of service agreements — most of which go unread.  
**LegalGuard** brings AI directly into your browser to **analyze**, **summarize**, and **translate** complex legal text in real time.  
Our mission: Protect your legal rights — never let hidden clauses take them away without you knowing.

---

## ✨ Features

| Feature | Description |
|----------|--------------|
| ⚖️ **Clause Detection** | Detects and classifies legal keywords (e.g., *privacy*, *liability*, *IP rights*, *payment terms*) using a curated glossary. |
| 💬 **Contextual Toast Alerts** | Instantly surfaces a toast explaining the type and risk level of detected clauses. |
| 📊 **Side Panel Analysis** | Uses **Chrome Summarizer API** Summarizing detected clauses, risk categories, and severity levels. |
| 🌐 **AI Translation** | Uses **Chrome Translator API** to render summaries in the user's preferred language. |
| 💡 **Prompt-Powered Q&A**| Integrates the **Chrome Prompt API**, enabling users to ask questions about any detected clause and receive clear, AI-generated explanations. |
| 🔄 **Seamless Workflow** | Works automatically — users simply browse, and LegalGuard activates in context. |
| 🎯 **Smart Highlighting** | Highlights detected legal terms directly on the page for easy identification. |
| 🎨 **ELI3 Mode** | Get explanations "like you're 3 years old" for maximum clarity. |

---

## 🚀 Installation

### Prerequisites
- **Chrome Browser** (version 88+)
- **Chrome AI APIs** enabled (Chrome 126+ with AI features)

### Install from Source
1. **Clone the repository:**
   ```bash
   git clone https://github.com/JanoKasu/LegalTextSimplifier.git LegalGuard
   cd LegalGuard
   ```

2. **Load the extension:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked" and select the `extension` folder
   - LegalGuard should now appear in your extensions list

3. **Pin the extension:**
   - Click the puzzle piece icon in Chrome's toolbar
   - Find LegalGuard and click the pin icon to keep it visible

---

## 📖 Usage

### Getting Started
1. **Browse normally** — LegalGuard works automatically on any webpage
2. **Look for toast notifications** when legal terms are detected
3. **Click "Highlight key risks"** to see terms highlighted on the page
4. **Click "Prepare for full analysis"** to enable the side panel
5. **Click the LegalGuard icon in the extension** to open the side panel

### Using the Side Panel
- **Page Analysis**: See detected legal terms categorized by risk level
- **Clause Q&A**: Ask questions about specific clauses
- **Translation**: Set your preferred language for automatic translation
- **Settings**: Mute notifications for specific sites


---

## 🏗️ Architecture

### Core Components

```
extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for side panel management
├── glossary_toast.js      # Content script for detection & highlighting
├── sidepanel.html         # Side panel UI
├── sidepanel.js          # Side panel logic & AI integration
├── glossary_tri.json     # Legal terms glossary
├── marked.min.js         # Markdown rendering
└── css/
    └── toast.css         # Toast notification styles
```

### Data Flow
1. **Content Script** (`glossary_toast.js`) scans page for legal terms
2. **Toast Notification** appears when terms are detected
3. **Side Panel** (`sidepanel.html/js`) provides detailed analysis
4. **AI Processing** uses Chrome LanguageModel API for explanations
5. **Translation** uses Chrome Translator API for multilingual support

### Legal Categories Detected
- 🔒 **Data & Privacy** — Data collection, sharing, and privacy rights
- ⚖️ **Rights & Obligations** — User responsibilities and platform rights
- 💳 **Payment & Subscription** — Billing, refunds, and subscription terms
- ⚠️ **Legal Risks & Disclaimer** — Liability limitations and disclaimers
- 📝 **Intellectual Property** — Copyright, trademarks, and usage rights
- 👤 **User Conduct** — Acceptable use policies and restrictions
- 📋 **Miscellaneous** — Other legal terms and conditions

---

## 🔧 Development

### Setup Development Environment
```bash
# Clone and navigate to project
git clone https://github.com/JanoKasu/LegalGuard.git
cd LegalGuard

# Load extension in Chrome
# 1. Go to chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select the extension/ folder
```

### Key Files to Modify
- **`glossary_tri.json`** — Add new legal terms and categories
- **`sidepanel.js`** — Modify AI prompts and response handling
- **`glossary_toast.js`** — Adjust detection logic and toast behavior
- **`sidepanel.html`** — Update UI layout and styling

### Testing
1. **Load extension** in Chrome developer mode
2. **Visit test pages** with legal content (e.g., privacy policies)
3. **Check console** for any errors or warnings
4. **Test AI features** require Chrome with AI APIs enabled

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and test thoroughly
4. **Commit your changes**: `git commit -m 'Add amazing feature'`
5. **Push to the branch**: `git push origin feature/amazing-feature`
6. **Open a Pull Request**

### Areas for Contribution
- 📚 **Glossary Expansion** — Add more legal terms and categories
- 🌍 **Internationalization** — Support for more languages
- 🎨 **UI/UX Improvements** — Better visual design and user experience
- 🧪 **Testing** — Automated tests and edge case handling
- 📖 **Documentation** — Improve guides and examples

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Authors & Contributors

### Core Team
- **Yiran (Irene) Ye** — Product/UX/Frontend Development
- **Ian McCracken** — Backend/UI System Integration

### AI Collaborators
- Gemini, ChatGPT, Vercel, Cursor

---

## 🙏 Acknowledgments

- **Chrome AI APIs** for providing powerful on-device AI capabilities
- **Legal professionals** who helped curate the initial glossary
- **Open source community** for inspiration and tools

---

## 📞 Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/JanoKasu/LegalGuard/issues)
- 💡 **Feature Requests**: [Start a discussion](https://github.com/JanoKasu/LegalGuard/discussions)
- 📧 **Contact**: [08ireneye@gmail.com](08ireneye@gmail.com) [ianandesmccracken@gmail.com](ianandesmccracken@gmail.com)
If you’re looking to **collaborate**, **find engineers or product managers**, or just want to **discuss ideas around AI + law**, feel free to reach out — we’d love to connect! 🤝
---

**Made with ❤️ for a more transparent digital world**


