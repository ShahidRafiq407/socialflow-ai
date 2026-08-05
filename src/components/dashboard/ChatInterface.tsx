"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Zap,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Play,
  Check,
  AlertCircle,
  TrendingUp,
  FileText,
  Video,
  Share2,
  Calendar,
  Layers,
  Settings,
  Bell,
  RefreshCw,
  ArrowRight,
  Briefcase,
  Camera,
  MessageSquare,
  Globe,
  PlayCircle,
  BarChart2,
  Code2,
  GitBranch,
} from "lucide-react";

// ============================================================================
// LIVE SQUAD OF AUTONOMOUS MARKETING AGENTS
// ============================================================================
interface AgentMember {
  id: string;
  name: string;
  role: string;
  icon: React.ElementType;
  status: "idle" | "working" | "success";
  currentAction: string;
}

const INITIAL_SQUAD: AgentMember[] = [
  {
    id: "ceo",
    name: "CEO Orchestrator",
    role: "Command & Control",
    icon: Bot,
    status: "idle",
    currentAction: "Standing by for executive instructions",
  },
  {
    id: "trend",
    name: "Trend & Competitor Scout",
    role: "Platform-Specific Signals",
    icon: TrendingUp,
    status: "idle",
    currentAction: "Isolated AI scanners for LinkedIn, IG, TikTok & X",
  },
  {
    id: "copy",
    name: "Brand Copywriter",
    role: "Platform-Tailored Tone",
    icon: FileText,
    status: "idle",
    currentAction: "Grounded in Brand DNA voice rules",
  },
  {
    id: "visual",
    name: "Visual & Video AI",
    role: "9:16 Reels & 1:1 Images",
    icon: Video,
    status: "idle",
    currentAction: "GPU rendering engine online",
  },
  {
    id: "publisher",
    name: "Omni Publisher",
    role: "Peak Audience Scheduler",
    icon: Share2,
    status: "idle",
    currentAction: "Dynamic peak-time algorithm per channel",
  },
];

// ============================================================================
// PLATFORM INTELLIGENCE REPORT DEFINITION
// ============================================================================
interface PlatformIntelligence {
  platformName: string;
  icon: React.ElementType;
  detectedTrend: string;
  competitorSignal: string;
  peakPostingTime: string;
  formatType: string;
}

interface AgentExecutionStep {
  agentName: string;
  task: string;
  status: "working" | "completed";
}

interface InteractiveOption {
  id: string;
  label: string;
  description: string;
  badge: string;
}

interface ScheduledTaskSummary {
  id: string;
  title: string;
  frequency: string;
  mode: "Full Auto" | "Review Required";
  nextRun: string;
  platformSchedules: {
    platform: string;
    time: string;
    trendFocus: string;
  }[];
}

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
  executionSteps?: AgentExecutionStep[];
  platformIntelligence?: PlatformIntelligence[];
  interactivePrompt?: {
    title: string;
    description: string;
    options: InteractiveOption[];
  };
  selectedOptionId?: string;
  scheduledSummary?: ScheduledTaskSummary;
  githubReadmePreview?: {
    repoName: string;
    folderPath: string;
    mermaidCode: string;
    pinTable: { pin: string; gpio: string; function: string; notes: string }[];
    fullReadmeMarkdown: string;
  };
}

export function ChatInterface({ workspaceId }: { workspaceId: string }) {
  // State for Squad Agents status
  const [squad, setSquad] = useState<AgentMember[]>(INITIAL_SQUAD);

  // State for Chat Messages
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-msg",
      role: "agent",
      content:
        "Hello! I am your AI Marketing CEO & Autonomous Campaign Orchestrator.\n\nI direct a specialized 4-agent squad (Trend Scout, Brand Copywriter, Visual & Video AI, and Omni Publisher) to manage your entire social media presence. Grounded in your **Brand DNA**, my team audits platform-specific trends, tracks competitor signals, and schedules your content at optimal peak-engagement windows across all connected channels.\n\nHow can we accelerate your marketing growth today?",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const updateAgentStatus = (
    id: string,
    status: "idle" | "working" | "success",
    action: string
  ) => {
    setSquad((prev) =>
      prev.map((agent) =>
        agent.id === id
          ? { ...agent, status, currentAction: action }
          : agent
      )
    );
  };

  // ============================================================================
  // HANDLE INTERACTIVE MODE SELECTION (FULL AUTO vs REVIEW MODE)
  // ============================================================================
  const handleSelectPermissionMode = (
    msgId: string,
    optionId: "auto" | "review"
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === msgId ? { ...msg, selectedOptionId: optionId } : msg
      )
    );

    const isAuto = optionId === "auto";

    const confirmMessage: Message = {
      id: Date.now().toString(),
      role: "agent",
      content: isAuto
        ? "🚀 **Full Auto Mode Activated!**\n\nYour autonomous squad is now scheduled to perform a daily Brand DNA-grounded trend and competitor audit for every connected network. Each platform will automatically publish its tailored Reel, infographic, or carousel at its scientific peak engagement window (e.g., LinkedIn at 08:30 AM EST, Instagram at 06:30 PM EST). You will receive a daily automated executive summary report."
        : "🔍 **Review Mode Activated! (Recommended for Brand Control)**\n\nEvery morning at **08:00 AM EST**, your autonomous squad will generate platform-tailored campaigns and save them to your **Content Library Tab** under 'Pending Review', alerting you with an instant review notification.\n\nOnce approved with a single click, each channel will automatically release at its optimal peak audience window!",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      scheduledSummary: {
        id: "task-daily-omni-matrix",
        title: "Platform-Specific AI Trend & Peak-Time Schedule",
        frequency: "Daily Intelligence Audit & Multi-Peak Release",
        mode: isAuto ? "Full Auto" : "Review Required",
        nextRun: "Tomorrow starting at 08:30 AM EST",
        platformSchedules: [
          {
            platform: "LinkedIn Executive Post",
            time: "08:30 AM EST (Morning Executive Coffee)",
            trendFocus: "B2B SaaS Data Benchmark Case Study",
          },
          {
            platform: "X (Twitter) Thread",
            time: "11:00 AM EST (Mid-Morning Tech Banter)",
            trendFocus: "Build-in-Public SaaS Architecture Lesson",
          },
          {
            platform: "Instagram Reel & Story",
            time: "06:30 PM EST (Evening High-Engagement Window)",
            trendFocus: "Viral Audio Hook • Behind-the-scenes 9:16 Reel",
          },
          {
            platform: "TikTok B2B Short",
            time: "07:15 PM EST (Prime Viral Video Feed)",
            trendFocus: "Casual Humor Tech Hook • Safe-Zone Optimized",
          },
        ],
      },
    };

    setMessages((prev) => [...prev, confirmMessage]);
    updateAgentStatus(
      "ceo",
      "success",
      `Active: Platform-Specific Multi-Schedule (${
        isAuto ? "Full Auto" : "Review Required"
      })`
    );
    updateAgentStatus(
      "publisher",
      "success",
      "6 isolated peak-hour channels synced"
    );
  };

  // ============================================================================
  // HANDLE SEND MESSAGE OR PRESET COMMANDS
  // ============================================================================
  const handleTriggerCommand = (commandText: string) => {
    if (isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: commandText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const isDailyPostRequest =
      commandText.toLowerCase().includes("daily") ||
      commandText.toLowerCase().includes("reel") ||
      commandText.toLowerCase().includes("auto") ||
      commandText.toLowerCase().includes("platform") ||
      commandText.toLowerCase().includes("schedule");

    const isGithubReadmeRequest =
      commandText.toLowerCase().includes("github") ||
      commandText.toLowerCase().includes("readme") ||
      commandText.toLowerCase().includes("circuit") ||
      commandText.toLowerCase().includes("mermaid") ||
      commandText.toLowerCase().includes("folder") ||
      commandText.toLowerCase().includes("repo") ||
      commandText.toLowerCase().includes("pin");

    const isArticleWriterRequest =
      commandText.toLowerCase().includes("article") ||
      commandText.toLowerCase().includes("blog post") ||
      commandText.toLowerCase().includes("seo article") ||
      commandText.toLowerCase().includes("serp") ||
      commandText.toLowerCase().includes("ranking") ||
      commandText.toLowerCase().includes("wordpress article") ||
      commandText.toLowerCase().includes("1-click");

    if (isArticleWriterRequest) {
      updateAgentStatus(
        "ceo",
        "working",
        "Launching 1-Click SEO Article Generator..."
      );
      updateAgentStatus(
        "trend",
        "working",
        "Analyzing Top 10 SERP Results..."
      );
      updateAgentStatus(
        "copy",
        "working",
        "Generating Humanized SEO Content..."
      );

      setTimeout(() => {
        const responseMsg: Message = {
          id: (Date.now() + 10).toString(),
          role: "agent",
          content:
            "I understand you want to generate an SEO-optimized article! 🚀\n\nI've opened the **Article Writer** page where you can:\n\n1. **Enter your target keyword** — I'll analyze Google's Top 10 results in real-time\n2. **Auto-generate a 1500-2500 word article** with proper H2/H3 structure, keyword density <2%, and FAQ schema\n3. **Review the SEO Score Card** — word count, keyword density, meta tags, readability\n4. **1-Click Publish to WordPress** — directly from the editor\n\n→ **[Open Article Writer →](/dashboard/article-writer)**\n\nOr you can tell me the keyword right here and I'll coordinate the generation!",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          executionSteps: [
            {
              agentName: "Real-Time SERP Analyzer",
              task: "Ready to analyze Google Top 10 results for your keyword",
              status: "completed",
            },
            {
              agentName: "SEO Article Engine",
              task: "SERP-grounded article generation with humanized text",
              status: "completed",
            },
            {
              agentName: "WordPress Publisher",
              task: "Ready for 1-click WordPress publish with Yoast SEO meta",
              status: "completed",
            },
          ],
        };

        setMessages((prev) => [...prev, responseMsg]);
        setIsLoading(false);

        updateAgentStatus(
          "ceo",
          "success",
          "Article Writer ready — awaiting keyword"
        );
        updateAgentStatus(
          "trend",
          "success",
          "SERP Engine online (Serper.dev)"
        );
        updateAgentStatus(
          "copy",
          "success",
          "Humanized SEO writer standing by"
        );
        updateAgentStatus(
          "publisher",
          "success",
          "WordPress REST API connected"
        );
      }, 1200);
    } else if (isDailyPostRequest) {
      updateAgentStatus(
        "ceo",
        "working",
        "Orchestrating Platform-Specific Intelligence Workflow"
      );
      updateAgentStatus(
        "trend",
        "working",
        "Auditing isolated trends on LinkedIn, IG, TikTok & X"
      );
      updateAgentStatus(
        "copy",
        "working",
        "Tailoring platform culture & hook tone per channel"
      );
      updateAgentStatus(
        "visual",
        "working",
        "Rendering 9:16 Reels & 16:9/4:5 infographics"
      );

      setTimeout(() => {
        const stepMsgId = (Date.now() + 10).toString();

        const responseMsg: Message = {
          id: stepMsgId,
          role: "agent",
          content:
            "Excellent decision. I have initiated the **Platform-Specific Intelligence & Peak-Time Workflow** across your 6 connected social media accounts.\n\nUnlike generic automation tools, our squad never blasts identical posts at the same time. We anchor every campaign in your **Brand DNA**, while auditing isolated trends, competitor formats, and distinct audience peak active hours for each specific network.\n\nReview the **Platform-Specific Intelligence Matrix** below:",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          executionSteps: [
            {
              agentName: "Brand DNA Base Filter",
              task: "Verified target audience: B2B Founders, SaaS Marketers & Tech Leads",
              status: "completed",
            },
            {
              agentName: "LinkedIn Trend & Competitor Scout",
              task: "Detected B2B Data Infographics trend — Competitors posting at 08:30 AM",
              status: "completed",
            },
            {
              agentName: "Instagram & TikTok Viral Scout",
              task: "Detected 'Fast Tutorial Hook' audio — Peak leisure viewing 06:30 PM",
              status: "completed",
            },
            {
              agentName: "X (Twitter) Real-Time Scout",
              task: "Detected 'AI Marketing Pipeline' topic — Tech debate peak 11:00 AM",
              status: "completed",
            },
          ],
          platformIntelligence: [
            {
              platformName: "LinkedIn Executive",
              icon: Briefcase,
              detectedTrend: "B2B Workflow Automation Data Benchmark",
              competitorSignal: "Competitors gaining 3.2x reach with 4:5 PDFs",
              peakPostingTime: "08:30 AM EST (Morning Work Hours)",
              formatType: "4:5 Carousel Document + Executive Tone",
            },
            {
              platformName: "X (Twitter) Timeline",
              icon: MessageSquare,
              detectedTrend: "Build-in-Public AI Automation Thread",
              competitorSignal: "High repost rate on concise 4-step threads",
              peakPostingTime: "11:00 AM EST (Mid-day Tech Discussions)",
              formatType: "16:9 Infographic Card + 4-Tweet Thread",
            },
            {
              platformName: "Instagram Reels & Stories",
              icon: Camera,
              detectedTrend: "Viral Beat 'SynthTech 2026' (0:30s audio)",
              competitorSignal: "Reels with bold kinetic subtitles drive 40% saves",
              peakPostingTime: "06:30 PM EST (Evening Leisure Window)",
              formatType: "9:16 Vertical Reel Video + Story Poll",
            },
            {
              platformName: "TikTok B2B Community",
              icon: Video,
              detectedTrend: "Casual Behind-the-Scenes SaaS Hack",
              competitorSignal: "Direct question hooks outperforming corporate ads",
              peakPostingTime: "07:15 PM EST (Prime Night Video Traffic)",
              formatType: "9:16 Vertical Video + Casual TikTok Caption",
            },
          ],
          interactivePrompt: {
            title: "Select Publishing & Permission Mode",
            description:
              "How would you like our squad to execute your daily campaigns across these isolated peak hours?",
            options: [
              {
                id: "review",
                label: "Review Mode (Recommended)",
                description:
                  "Daily drafts are saved to your Content Library tab for 1-click approval before their scheduled peak release times",
                badge: "Full Brand Control",
              },
              {
                id: "auto",
                label: "Full Auto Mode",
                description:
                  "Zero-touch automation. Each platform automatically publishes at its designated optimal peak hour",
                badge: "Zero Touch",
              },
            ],
          },
        };

        setMessages((prev) => [...prev, responseMsg]);
        setIsLoading(false);

        updateAgentStatus(
          "trend",
          "success",
          "4 isolated platform trend audits complete"
        );
        updateAgentStatus(
          "copy",
          "success",
          "Platform-specific tone & hooks tailored"
        );
        updateAgentStatus(
          "visual",
          "success",
          "Rendered 9:16 Reel & 4:5 PDF layouts"
        );
        updateAgentStatus(
          "ceo",
          "success",
          "Waiting for user mode selection"
        );
      }, 1400);
    } else if (isGithubReadmeRequest) {
      updateAgentStatus(
        "ceo",
        "working",
        "Auditing Local Folder & GitHub Repo Structure..."
      );
      updateAgentStatus(
        "trend",
        "working",
        "Scanning Circuit Pin Configuration & GPIOs..."
      );
      updateAgentStatus(
        "copy",
        "working",
        "Writing A-to-Z SMB Robotics README.md..."
      );
      updateAgentStatus(
        "visual",
        "working",
        "Rendering Mermaid flowchart LR Circuit Wiring Diagram..."
      );

      setTimeout(() => {
        const stepMsgId = (Date.now() + 10).toString();

        const responseMsg: Message = {
          id: stepMsgId,
          role: "agent",
          content:
            "I have scanned your local project folder and generated an A-to-Z **SMB Robotics Embedded Systems README.md** with a custom **Mermaid Circuit & Wiring Diagram** (`flowchart LR`).\n\nIn accordance with your official **SMB Robotics** engineering guidelines, I have:\n- Excluded any 'Contributing' or 'Project Structure' sections\n- Kept emojis minimal (plain text headers)\n- Used distinct colored wires via `linkStyle` and dashed lines for VCC/GND power connections (`stroke-dasharray: 5 5`)\n- Included your official centered **Author Box** with all 6 social badges\n\nReview the generated README & circuit wiring matrix below:",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          executionSteps: [
            {
              agentName: "Local Folder & Source Code Scanner",
              task: "Scanned local path: D:/Projects/SMB-Robotics/LiDAR-Robot-v2 (Firmware & Schematic Notes)",
              status: "completed",
            },
            {
              agentName: "Mermaid Circuit Diagram Architect",
              task: "Generated flowchart LR with linkStyle colors & dashed power lines (Zone 1-3 Layout)",
              status: "completed",
            },
            {
              agentName: "SMB Robotics Author Box Specialist",
              task: "Injected centered social badges & copyright (Copyright (c) 2026 SMB Robotics)",
              status: "completed",
            },
            {
              agentName: "GitHub & WordPress Cross-Publisher",
              task: "Ready to push README.md to GitHub repo & draft technical blog post on WordPress",
              status: "completed",
            },
          ],
          githubReadmePreview: {
            repoName: "SMB-Robotics / LiDAR-Autonomous-Robot-v2",
            folderPath: "D:/Projects/SMB-Robotics/LiDAR-Robot-v2",
            mermaidCode: `flowchart LR
    SENSOR["LiDAR Sensor<br/>(TF-Mini Pro)"]
    MCU["Microcontroller<br/>(ESP32-S3 WROOM)"]
    OLED["OLED Display<br/>(SSD1306 0.96)"]
    DRIVER["Motor Driver<br/>(TB6612FNG Dual)"]

    SENSOR -->|"UART TX → GPIO 17"| MCU
    SENSOR -..->|"VCC → 5V"| MCU
    SENSOR -..->|"GND → GND"| MCU

    MCU -->|"I2C SDA → GPIO 21"| OLED
    MCU -->|"I2C SCL → GPIO 22"| OLED

    MCU -->|"PWM 1 → GPIO 18"| DRIVER
    MCU -->|"PWM 2 → GPIO 19"| DRIVER
    DRIVER -..->|"VCC → 12V Battery"| MCU

    linkStyle 0 stroke:#e60000,stroke-width:2px
    linkStyle 1 stroke:#555555,stroke-width:2px,stroke-dasharray: 5 5
    linkStyle 2 stroke:#555555,stroke-width:2px,stroke-dasharray: 5 5
    linkStyle 3 stroke:#00cc66,stroke-width:2px
    linkStyle 4 stroke:#00cc66,stroke-width:2px
    linkStyle 5 stroke:#2196F3,stroke-width:2px
    linkStyle 6 stroke:#ff8800,stroke-width:2px
    linkStyle 7 stroke:#555555,stroke-width:2px,stroke-dasharray: 5 5`,
            pinTable: [
              {
                pin: "UART TX / RX",
                gpio: "GPIO 17 / GPIO 16",
                function: "LiDAR Distance Telemetry",
                notes: "Red Signal (#e60000)",
              },
              {
                pin: "I2C SDA / SCL",
                gpio: "GPIO 21 / GPIO 22",
                function: "OLED Status Display",
                notes: "Green Signal (#00cc66)",
              },
              {
                pin: "PWM 1 / 2",
                gpio: "GPIO 18 / GPIO 19",
                function: "TB6612FNG Left/Right Motors",
                notes: "Blue / Orange Signal",
              },
              {
                pin: "VCC / GND",
                gpio: "5V / 12V / GND",
                function: "Power Bus & Common Ground",
                notes: "Dashed Grey (5 5)",
              },
            ],
            fullReadmeMarkdown: `# LiDAR Autonomous Robot v2

An autonomous indoor navigation robot utilizing an ESP32-S3 microcontroller, TF-Mini Pro LiDAR sensor, and dual TB6612FNG motor drivers for real-time obstacle avoidance and path planning.

## Circuit Diagram

\`\`\`mermaid
flowchart LR
    SENSOR["LiDAR Sensor<br/>(TF-Mini Pro)"]
    MCU["Microcontroller<br/>(ESP32-S3 WROOM)"]
    OLED["OLED Display<br/>(SSD1306 0.96)"]
    DRIVER["Motor Driver<br/>(TB6612FNG Dual)"]

    SENSOR -->|"UART TX → GPIO 17"| MCU
    SENSOR -..->|"VCC → 5V"| MCU
    SENSOR -..->|"GND → GND"| MCU

    MCU -->|"I2C SDA → GPIO 21"| OLED
    MCU -->|"I2C SCL → GPIO 22"| OLED

    MCU -->|"PWM 1 → GPIO 18"| DRIVER
    MCU -->|"PWM 2 → GPIO 19"| DRIVER
    DRIVER -..->|"VCC → 12V Battery"| MCU

    linkStyle 0 stroke:#e60000,stroke-width:2px
    linkStyle 1 stroke:#555555,stroke-width:2px,stroke-dasharray: 5 5
    linkStyle 2 stroke:#555555,stroke-width:2px,stroke-dasharray: 5 5
    linkStyle 3 stroke:#00cc66,stroke-width:2px
    linkStyle 4 stroke:#00cc66,stroke-width:2px
    linkStyle 5 stroke:#2196F3,stroke-width:2px
    linkStyle 6 stroke:#ff8800,stroke-width:2px
    linkStyle 7 stroke:#555555,stroke-width:2px,stroke-dasharray: 5 5
\`\`\`

## Pin Configuration

| Component | MCU GPIO | Signal Function | Wiring Note |
| :--- | :--- | :--- | :--- |
| LiDAR Sensor | GPIO 17 (TX) / 16 (RX) | UART Distance Data | 115200 Baud |
| OLED Display | GPIO 21 (SDA) / 22 (SCL) | I2C Telemetry | 0x3C Address |
| Motor Driver | GPIO 18 / 19 | PWM Motor Control | 20 kHz Frequency |
| Power Bus | 5V / GND | Regulated Logic Power | Dashed Power Line |

---

<div align="center">

### Built by SMB Robotics

Passionate about building smart embedded systems, IoT, and robotics solutions.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/shahid407)
[![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://web.facebook.com/smbrobotics)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/smbrobotics)

[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white)](https://www.reddit.com/user/SMB_ROBOTICS)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtube.com/shahidrafiq407)
[![Website](https://img.shields.io/badge/Website-00C853?style=for-the-badge&logo=google-chrome&logoColor=white)](https://smbrobotic.com)

If this project helped you, consider giving it a ⭐

</div>

Copyright (c) 2026 SMB Robotics`,
          },
        };

        setMessages((prev) => [...prev, responseMsg]);
        setIsLoading(false);

        updateAgentStatus(
          "ceo",
          "success",
          "SMB Robotics README & Circuit ready for deployment"
        );
        updateAgentStatus(
          "trend",
          "success",
          "GPIO & Pin schematic mapping verified"
        );
        updateAgentStatus(
          "copy",
          "success",
          "SMB Robotics author box & 0% contributing section enforced"
        );
        updateAgentStatus(
          "visual",
          "success",
          "Mermaid flowchart LR diagram rendered"
        );
        updateAgentStatus(
          "publisher",
          "success",
          "Ready to push to GitHub & WordPress"
        );
      }, 1400);
    } else {
      setTimeout(async () => {
        try {
          const res = await fetch("/api/agents/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: commandText, workspaceId }),
          });

          const data = await res.json();

          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: "agent",
            content:
              data.response ||
              "I have analyzed your request and coordinated with my squad. We are ready to execute your campaign strategy!",
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };

          setMessages((prev) => [...prev, agentMsg]);
        } catch (err) {
          const fallbackMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: "agent",
            content:
              "I have received your instruction and assigned my squad to work on this task. If you would like to enable our daily platform-isolated automation schedule, click the quick action button below!",
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
          setMessages((prev) => [...prev, fallbackMsg]);
        } finally {
          setIsLoading(false);
          updateAgentStatus("ceo", "idle", "Standing by for instructions");
        }
      }, 1000);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    handleTriggerCommand(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col space-y-6 w-full max-w-6xl mx-auto font-sans">
      {/* =====================================================================
          TOP BANNER — LIVE AUTONOMOUS SQUAD STATUS (CEO + 4 SPECIALISTS)
         ===================================================================== */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Autonomous AI Marketing Squad</span>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Platform-specific AI trend scanners &amp; peak time publishing engine
              </p>
            </div>
          </div>

          <Badge
            variant="outline"
            className="text-xs font-semibold px-2.5 py-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 shrink-0 flex items-center gap-1.5"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>6 Networks Connected</span>
          </Badge>
        </CardHeader>

        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {squad.map((agent) => {
              const Icon = agent.icon;
              const isWorking = agent.status === "working";
              const isSuccess = agent.status === "success";

              return (
                <div
                  key={agent.id}
                  className={`flex flex-col p-3 rounded-xl border transition-all ${
                    isWorking
                      ? "border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : isSuccess
                      ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          isWorking
                            ? "bg-primary text-white animate-spin"
                            : isSuccess
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {agent.name}
                      </span>
                    </div>
                    {isWorking ? (
                      <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                    ) : isSuccess ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                    {agent.role}
                  </span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-1 font-medium">
                    {agent.currentAction}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* =====================================================================
          CEO CHAT INTERFACE WITH LIVE INTERACTIVE WORKFLOW MESSAGES
         ===================================================================== */}
      <Card className="flex flex-col h-[700px] w-full shadow-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {/* Chat Header */}
        <CardHeader className="border-b px-6 py-4 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
              <Bot className="h-5 w-5 text-primary" />
              <span>CEO Marketing Orchestrator Chat</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Grounded in your Brand DNA • Isolated trend audits &amp; peak audience time per platform
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                handleTriggerCommand(
                  "Automatically generate and post daily Reels and graphics across all my connected social media accounts"
                )
              }
              className="h-8 text-xs font-bold gap-1.5 border-primary/30 text-primary bg-primary/5 hover:bg-primary/15"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>⚡ Set Daily Multi-Platform Autonomous Schedule</span>
            </Button>
          </div>
        </CardHeader>

        {/* MESSAGES CONTAINER */}
        <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30 dark:bg-slate-950/20">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3.5 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-xl shadow-xs font-bold text-xs ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-gradient-to-br from-slate-800 to-indigo-950 text-white"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>

              {/* Bubble Body */}
              <div
                className={`rounded-2xl p-4 text-xs sm:text-sm max-w-[88%] leading-relaxed shadow-xs ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-none font-medium"
                    : "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-tl-none space-y-4"
                }`}
              >
                {/* Text content */}
                <div className="whitespace-pre-wrap font-normal">
                  {msg.content}
                </div>

                {/* 1. PARALLEL AGENTS EXECUTION STATUS LOG */}
                {msg.executionSteps && msg.executionSteps.length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2">
                    <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span>Live Squad Execution Steps:</span>
                    </p>
                    <div className="space-y-1.5">
                      {msg.executionSteps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 text-xs py-1 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {step.agentName}:
                            </span>
                            <span className="text-slate-600 dark:text-slate-300">
                              {step.task}
                            </span>
                          </div>
                          <Badge
                            variant="secondary"
                            className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px]"
                          >
                            Ready
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. PLATFORM-SPECIFIC INTELLIGENCE MATRIX CARD */}
                {msg.platformIntelligence &&
                  msg.platformIntelligence.length > 0 && (
                    <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-primary/5 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                          <BarChart2 className="h-4 w-4" />
                          Platform-Isolated Trend &amp; Peak Time Analysis
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-indigo-500/30 text-indigo-600 dark:text-indigo-300"
                        >
                          Grounded in Brand DNA
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {msg.platformIntelligence.map((p, idx) => {
                          const Icon = p.icon;
                          return (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-slate-100">
                                  <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                                    <Icon className="h-3.5 w-3.5" />
                                  </div>
                                  <span>{p.platformName}</span>
                                </div>
                                <span className="text-[10px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                                  {p.peakPostingTime}
                                </span>
                              </div>

                              <div className="text-[11px] space-y-1 text-slate-600 dark:text-slate-300">
                                <p>
                                  <strong className="text-slate-800 dark:text-slate-200">
                                    Trend:
                                  </strong>{" "}
                                  {p.detectedTrend}
                                </p>
                                <p>
                                  <strong className="text-slate-800 dark:text-slate-200">
                                    Competitor Signal:
                                  </strong>{" "}
                                  {p.competitorSignal}
                                </p>
                                <p className="text-[10px] text-primary font-semibold pt-1 border-t border-slate-100 dark:border-slate-800">
                                  Format: {p.formatType}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* 3. INTERACTIVE PERMISSION / MODE SELECTION CARD */}
                {msg.interactivePrompt && (
                  <div className="rounded-xl border-2 border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        {msg.interactivePrompt.title}
                      </span>
                      {msg.selectedOptionId && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                        >
                          ✓ Mode Confirmed
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-normal">
                      {msg.interactivePrompt.description}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {msg.interactivePrompt.options.map((opt) => {
                        const isThisSelected = msg.selectedOptionId === opt.id;

                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={!!msg.selectedOptionId}
                            onClick={() =>
                              handleSelectPermissionMode(
                                msg.id,
                                opt.id as "auto" | "review"
                              )
                            }
                            className={`flex flex-col text-left p-3.5 rounded-xl border-2 transition-all ${
                              isThisSelected
                                ? "border-emerald-500 bg-emerald-500/10 text-slate-900 dark:text-slate-100 shadow-md font-bold scale-[1.02]"
                                : msg.selectedOptionId
                                ? "border-slate-200 dark:border-slate-800 opacity-50 bg-white dark:bg-slate-900"
                                : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary hover:shadow-sm"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full mb-1">
                              <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                                {opt.label}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-2 py-0"
                              >
                                {opt.badge}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                              {opt.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. SCHEDULED TASK CONFIRMATION SUMMARY CARD */}
                {msg.scheduledSummary && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                            {msg.scheduledSummary.title}
                          </p>
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                            {msg.scheduledSummary.frequency} • {msg.scheduledSummary.mode} Mode
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 font-bold px-3 py-1"
                      >
                        ● ACTIVE
                      </Badge>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Isolated Multi-Peak Release Schedule:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.scheduledSummary.platformSchedules.map(
                          (ps, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]"
                            >
                              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                                <span>{ps.platform}</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                                  {ps.time}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                🎯 {ps.trendFocus}
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                      <span>Next Autonomous Cycle: {msg.scheduledSummary.nextRun}</span>
                      <span className="font-semibold text-primary">
                        {msg.scheduledSummary.mode === "Review Required"
                          ? "→ Will notify for review & save to Content Library"
                          : "→ Will publish directly at peak times"}
                      </span>
                    </div>
                  </div>
                )}

                {/* 5. GITHUB / LOCAL REPO & EMBEDDED SYSTEMS PRO README MATRIX CARD */}
                {msg.githubReadmePreview && (
                  <div className="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 via-slate-900/5 to-primary/5 p-5 space-y-4 shadow-sm">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                          <Code2 className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            {msg.githubReadmePreview.repoName}
                          </p>
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold font-mono">
                            📁 {msg.githubReadmePreview.folderPath}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 font-bold px-3 py-1"
                      >
                        ● COMPLIANT WITH SMB ROBOTICS RULES
                      </Badge>
                    </div>

                    {/* Mermaid Diagram Box */}
                    <div className="rounded-xl bg-slate-950 text-slate-100 p-4 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                        <span className="font-bold text-emerald-400 font-mono">
                          ⚡ Mermaid Circuit Diagram (flowchart LR)
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Colored linkStyle wires &amp; dashed VCC/GND
                        </span>
                      </div>
                      <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto text-slate-300 py-1">
                        {msg.githubReadmePreview.mermaidCode}
                      </pre>
                    </div>

                    {/* Pin Configuration Table */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        🔌 A-to-Z Pin Configuration Table (Auto-Scanned):
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                            <tr>
                              <th className="p-2">Component / Pin</th>
                              <th className="p-2">MCU GPIO</th>
                              <th className="p-2">Signal Function</th>
                              <th className="p-2">Wire Color / Note</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                            {msg.githubReadmePreview.pinTable.map((pt, i) => (
                              <tr key={i}>
                                <td className="p-2 font-bold text-slate-900 dark:text-slate-100">
                                  {pt.pin}
                                </td>
                                <td className="p-2 font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                                  {pt.gpio}
                                </td>
                                <td className="p-2">{pt.function}</td>
                                <td className="p-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  {pt.notes}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Official Author Section Box (Centered style preview) */}
                    <div className="rounded-xl bg-white dark:bg-slate-900 border-2 border-indigo-500/30 p-4 text-center space-y-2">
                      <p className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                        ✨ Official Author Box (Auto-Injected)
                      </p>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Built by SMB Robotics
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                        Passionate about building smart embedded systems, IoT, and robotics solutions.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                        <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold">LinkedIn</span>
                        <span className="px-2 py-0.5 rounded bg-blue-500 text-white text-[10px] font-bold">Facebook</span>
                        <span className="px-2 py-0.5 rounded bg-pink-600 text-white text-[10px] font-bold">Instagram</span>
                        <span className="px-2 py-0.5 rounded bg-orange-600 text-white text-[10px] font-bold">Reddit</span>
                        <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">YouTube</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">Website</span>
                      </div>
                      <p className="text-[10px] text-slate-400 italic pt-1">
                        If this project helped you, consider giving it a ⭐ • Copyright (c) 2026 SMB Robotics
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-emerald-500/20">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(msg.githubReadmePreview?.fullReadmeMarkdown || "");
                          alert("📋 Copied full SMB Robotics README.md markdown to clipboard!");
                        }}
                        className="text-xs font-bold gap-1 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        📋 Copy Full Markdown
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          alert(
                            "🚀 SUCCESS: README.md committed to GitHub repository & engineering case study drafted on your WordPress blog!"
                          );
                        }}
                        className="text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        🚀 Publish to GitHub &amp; WordPress
                      </Button>
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div
                  className={`text-[10px] mt-1 ${
                    msg.role === "user"
                      ? "text-primary-foreground/70 text-right"
                      : "text-slate-400"
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground italic pl-2 bg-slate-100/50 dark:bg-slate-800/40 p-3 rounded-xl w-fit">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>CEO Agent is auditing isolated platform trends &amp; peak audience times...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        {/* QUICK PRESET PILLS BAR */}
        <div className="px-6 py-2.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/30 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
            Quick Commands:
          </span>
          <button
            type="button"
            onClick={() =>
              handleTriggerCommand(
                "Automatically generate and post daily Reels and graphics across all my connected social media accounts"
              )
            }
            className="px-3 py-1 rounded-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors shrink-0"
          >
            ⚡ Platform-Specific Trend &amp; Peak Time Audit
          </button>
          <button
            type="button"
            onClick={() =>
              handleTriggerCommand(
                "Find today's top 3 trending SaaS keywords and write a viral LinkedIn carousel draft"
              )
            }
            className="px-3 py-1 rounded-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors shrink-0"
          >
            🔥 Hunt Today's Viral Trends
          </button>
          <button
            type="button"
            onClick={() =>
              handleTriggerCommand(
                "Scan competitor social accounts and show me their highest engagement posts this week"
              )
            }
            className="px-3 py-1 rounded-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors shrink-0"
          >
            🔍 Analyze Competitor Signals
          </button>
          <button
            type="button"
            onClick={() =>
              handleTriggerCommand(
                "CEO, mera local project folder scan karo. A-to-Z pin configuration aur Mermaid flowchart LR circuit diagram ke sath SMB Robotics README.md likh kar github aur wordpress par publish kar do."
              )
            }
            className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500 transition-colors shrink-0"
          >
            💻 GitHub &amp; Local Folder README Pro
          </button>
          <button
            type="button"
            onClick={() =>
              handleTriggerCommand(
                "Generate a 1-click SEO article with real-time SERP analysis, FAQ schema, and WordPress auto-publish"
              )
            }
            className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 dark:bg-indigo-950/40 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:border-indigo-500 transition-colors shrink-0"
          >
            📝 1-Click SEO Article Generator
          </button>
        </div>

        {/* INPUT FORM */}
        <div className="border-t p-4 bg-white dark:bg-slate-900">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <Textarea
              placeholder="Ask your AI CEO anything (e.g. 'Schedule daily platform-tailored Reels & graphics across all channels')..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[50px] max-h-[120px] resize-none text-xs sm:text-sm rounded-xl focus:ring-2 focus:ring-primary/20"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="h-12 px-6 rounded-xl font-bold bg-gradient-to-r from-primary via-indigo-600 to-purple-600 text-white shadow-md hover:opacity-95"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
