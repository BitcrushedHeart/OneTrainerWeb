import { useState, useEffect, useCallback, useMemo } from "react";
import { configApi } from "@/api/configApi";

interface WikiSection {
  title: string;
  pages: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(line: string): string {
  // Split on HTML tags to preserve them, escape only non-HTML parts
  const parts = line.split(/(<[^>]+>)/g);
  let result = parts
    .map((part) => {
      // If it looks like an HTML tag, pass through
      if (/^<[^>]+>$/.test(part)) return part;
      return escapeHtml(part);
    })
    .join("");

  // Images: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Bold + italic: ***text*** or ___text___
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  result = result.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

  return result;
}

function isHtmlLine(line: string): boolean {
  return /^\s*<(?:img|div|p|br|hr|details|summary|table|tr|td|th|thead|tbody|figcaption|figure|picture|source|video|iframe)\b/i.test(
    line.trim(),
  );
}

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let i = 0;

  const pushParagraph = (text: string) => {
    if (text.trim()) {
      html.push(`<p>${inlineMarkdown(text.trim())}</p>`);
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks: ```lang ... ```
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      html.push(`<pre><code${langAttr}>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    // Raw HTML lines (like <img>, <details>, etc.) — pass through
    if (isHtmlLine(line)) {
      // Collect consecutive HTML lines
      const htmlBlock: string[] = [];
      while (i < lines.length && (isHtmlLine(lines[i]) || (htmlBlock.length > 0 && lines[i].trim() !== "" && !lines[i].startsWith("#")))) {
        htmlBlock.push(lines[i]);
        i++;
        // Break if we hit a closing tag that matches an opening one
        if (htmlBlock.length > 1 && /^\s*<\//.test(lines[i - 1])) break;
      }
      html.push(htmlBlock.join("\n"));
      continue;
    }

    // Headings: # H1, ## H2, ### H3, #### H4
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule: --- or ***
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push("<hr />");
      i++;
      continue;
    }

    // Tables: | ... | ... |
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableRows: string[][] = [];
      let hasHeader = false;

      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        const row = lines[i].trim();

        // Check for separator row (|---|---|)
        if (/^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|$/.test(row)) {
          hasHeader = true;
          i++;
          continue;
        }

        const cells = row
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        tableRows.push(cells);
        i++;
      }

      if (tableRows.length > 0) {
        html.push("<table>");
        tableRows.forEach((cells, rowIdx) => {
          const isHeaderRow = hasHeader && rowIdx === 0;
          const tag = isHeaderRow ? "th" : "td";
          const rowHtml = cells.map((c) => `<${tag}>${inlineMarkdown(c)}</${tag}>`).join("");
          if (isHeaderRow) {
            html.push(`<thead><tr>${rowHtml}</tr></thead><tbody>`);
          } else {
            html.push(`<tr>${rowHtml}</tr>`);
          }
        });
        if (hasHeader) {
          html.push("</tbody>");
        }
        html.push("</table>");
      }
      continue;
    }

    // Blockquote: > text
    if (line.startsWith("> ") || line === ">") {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote>${markdownToHtml(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    // Unordered list: - item or * item
    if (/^(\s*)([-*+])\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^(\s*)([-*+])\s+/.test(lines[i])) {
        const match = lines[i].match(/^(\s*)([-*+])\s+(.*)$/);
        if (match) {
          listItems.push(inlineMarkdown(match[3]));
        }
        i++;
      }
      html.push("<ul>");
      listItems.forEach((item) => html.push(`<li>${item}</li>`));
      html.push("</ul>");
      continue;
    }

    // Ordered list: 1. item
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const match = lines[i].match(/^\s*\d+\.\s+(.*)$/);
        if (match) {
          listItems.push(inlineMarkdown(match[1]));
        }
        i++;
      }
      html.push("<ol>");
      listItems.forEach((item) => html.push(`<li>${item}</li>`));
      html.push("</ol>");
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      !lines[i].startsWith("| ") &&
      !/^(\s*)([-*+])\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !isHtmlLine(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      pushParagraph(paraLines.join(" "));
    }
  }

  return html.join("\n");
}

function formatPageName(slug: string): string {
  return slug.replace(/-/g, " ").replace("F.A.Q.", "FAQ");
}

const FALLBACK_SECTIONS: WikiSection[] = [
  {
    title: "Getting Started",
    pages: ["Home", "Onboarding-Guide-for-Newcomers", "The-Program"],
  },
  {
    title: "Configuration",
    pages: ["General", "Model", "Data", "Concepts", "Training"],
  },
  {
    title: "Training",
    pages: ["Optimizers", "Advanced-Optimizers", "Custom-Scheduler"],
  },
  {
    title: "Methods",
    pages: ["LoRA", "Embedding", "Additional-Embeddings"],
  },
  {
    title: "Guides & FAQ",
    pages: ["F.A.Q.", "Lessons-Learnt-and-Tutorials"],
  },
];

export default function HelpPage() {
  const [sections, setSections] = useState<WikiSection[]>([]);
  const [activePage, setActivePage] = useState<string>("Home");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the page list on mount
  useEffect(() => {
    let cancelled = false;
    const fetchPages = async () => {
      try {
        const data = await configApi.wikiPages();
        if (!cancelled) {
          setSections(data as WikiSection[]);
        }
      } catch {
        if (!cancelled) {
          setSections(FALLBACK_SECTIONS);
        }
      }
    };
    fetchPages();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch a specific page
  const fetchPage = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    setActivePage(slug);
    try {
      const data = await configApi.wikiPage(slug);
      setContent(data.content);
    } catch {
      setError(`Failed to load "${formatPageName(slug)}". Check your connection and try again.`);
      setContent("");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the default page on mount (or when sections arrive)
  useEffect(() => {
    if (sections.length > 0 && sections[0].pages.length > 0) {
      fetchPage(sections[0].pages[0]);
    }
  }, [sections, fetchPage]);

  // Convert markdown content to HTML
  const renderedHtml = useMemo(() => {
    if (!content) return "";
    return markdownToHtml(content);
  }, [content]);

  return (
    <div className="flex gap-0" style={{ minHeight: "calc(100vh - 200px)" }}>
      <nav
        className="flex-shrink-0 border-r"
        style={{
          width: 260,
          borderColor: "var(--color-border-subtle)",
          background: "var(--color-surface-raised)",
          borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "16px 0" }}>
          <h3
            className="text-sm font-semibold uppercase tracking-wider"
            style={{
              padding: "0 16px 12px",
              margin: 0,
              color: "var(--color-on-surface-secondary)",
              borderBottom: "1px solid var(--color-border-subtle)",
            }}
          >
            Documentation
          </h3>
          {sections.map((section) => (
            <div key={section.title} style={{ marginTop: 12 }}>
              <div
                className="text-xs font-semibold uppercase tracking-wider"
                style={{
                  padding: "4px 16px 6px",
                  color: "var(--color-on-surface-secondary)",
                  opacity: 0.7,
                }}
              >
                {section.title}
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {section.pages.map((slug) => (
                  <li key={slug}>
                    <button
                      onClick={() => fetchPage(slug)}
                      className="text-sm"
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "5px 16px 5px 24px",
                        border: "none",
                        cursor: "pointer",
                        transition: "background-color 200ms ease-out, color 200ms ease-out",
                        background:
                          activePage === slug
                            ? "linear-gradient(90deg, var(--color-orchid-600-alpha-12), var(--color-violet-500-alpha-08))"
                            : "transparent",
                        color:
                          activePage === slug
                            ? "var(--color-orchid-600)"
                            : "var(--color-on-surface)",
                        fontWeight: activePage === slug ? 600 : 400,
                        borderRight:
                          activePage === slug
                            ? "2px solid var(--color-orchid-600)"
                            : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (activePage !== slug) {
                          e.currentTarget.style.background = "var(--color-input-bg)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activePage !== slug) {
                          e.currentTarget.style.background = "transparent";
                        }
                      }}
                    >
                      {formatPageName(slug)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div
        className="flex-1"
        style={{
          background: "var(--color-surface-raised)",
          borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
          padding: "24px 32px",
          overflowY: "auto",
          minWidth: 0,
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div
              className="skeleton"
              style={{
                width: 200,
                height: 24,
                margin: "0 auto 16px",
                borderRadius: 6,
              }}
            />
            <div
              className="skeleton"
              style={{
                width: "80%",
                height: 16,
                margin: "0 auto 8px",
                borderRadius: 4,
              }}
            />
            <div
              className="skeleton"
              style={{
                width: "60%",
                height: 16,
                margin: "0 auto 8px",
                borderRadius: 4,
              }}
            />
            <div
              className="skeleton"
              style={{
                width: "70%",
                height: 16,
                margin: "0 auto",
                borderRadius: 4,
              }}
            />
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              padding: "24px",
              background: "var(--color-error-500-alpha-08)",
              border: "1px solid var(--color-error-500-alpha-20)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-error-500)",
              textAlign: "center",
            }}
          >
            <p style={{ margin: "0 0 12px", fontWeight: 500 }}>{error}</p>
            <button
              onClick={() => fetchPage(activePage)}
              className="action-button"
              style={{ fontSize: "var(--text-caption)" }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && renderedHtml && (
          <div
            className="wiki-content"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}

        {!loading && !error && !renderedHtml && (
          <div
            style={{
              textAlign: "center",
              padding: "48px 0",
              color: "var(--color-on-surface-secondary)",
            }}
          >
            <p>Select a page from the sidebar to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
