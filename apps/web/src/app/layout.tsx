import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Guild — 游戏化教学平台",
  description: "面向教学场景的像素风 Web RPG Agent 世界",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0d1426",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#app-content">
          跳到主要内容
        </a>
        <div id="app-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
