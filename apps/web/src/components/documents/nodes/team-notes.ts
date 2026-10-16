import { Node, mergeAttributes } from "@tiptap/core";

export interface TeamNotesOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    teamNotes: {
      /**
       * Set a team notes block
       */
      setTeamNotes: () => ReturnType;
      /**
       * Toggle a team notes block
       */
      toggleTeamNotes: () => ReturnType;
    };
  }
}

export const TeamNotes = Node.create<TeamNotesOptions>({
  name: "team_notes",

  group: "block",

  content: "block+",

  defining: true,

  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="team_notes"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "team_notes",
        class:
          "my-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 transition-colors relative overflow-hidden",
      }),
      [
        "div",
        {
          class:
            "flex items-center gap-1.5 text-xs font-semibold  text-amber-400 mb-2 select-none",
          contenteditable: "false",
        },
        [
          "svg",
          {
            xmlns: "http://www.w3.org/2000/svg",
            width: "14",
            height: "14",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            class: "inline-block",
          },
          ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
          ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }],
        ],
        ["span", {}, "Team note — client & share link viewers cannot see this"],
      ],
      ["div", { class: "team-notes-content text-foreground font-normal" }, 0],
    ];
  },

  addCommands() {
    return {
      setTeamNotes:
        () =>
        ({ commands }) => {
          return commands.setNode(this.name);
        },
      toggleTeamNotes:
        () =>
        ({ commands }) => {
          return commands.toggleWrap(this.name);
        },
    };
  },
});
