import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
}

// Playhead / Studio Logo
export function PlayheadLogo({ size = 28, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect width="32" height="32" rx="8" fill="#4876F3" />
      <path
        d="M12 9H18.5C21.5376 9 24 11.4624 24 14.5C24 17.5376 21.5376 20 18.5 20H15V24H12V9Z"
        fill="white"
      />
      <circle cx="17.5" cy="14.5" r="2.5" fill="#4876F3" />
    </svg>
  );
}

// Overview Icon (4-squares grid from Overview-1.svg)
export function OverviewIcon({ size = 20, color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect x="3" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="14" width="7" height="7" rx="2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 14V21M14 17.5H21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Project Icon (from Project.svg)
export function ProjectIcon({ size = 20, color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M7 6V14C7 15.1046 7.89543 16 9 16H15M7 6V4C7 2.89543 7.89543 2 9 2H13.5858C13.851 2 14.1054 2.10536 14.2929 2.29289L18.7071 6.70711C18.8946 6.89464 19 7.149 19 7.41421V14C19 15.1046 18.1046 16 17 16H15M7 6H5C3.89543 6 3 6.89543 3 8V18C3 19.1046 3.89543 20 5 20H13C14.1046 20 15 19.1046 15 18V16"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Boards / Workflow Icon (from Task.svg)
export function BoardIcon({ size = 20, color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <circle cx="6" cy="12" r="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="6" r="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="18" r="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.7 10.7L15.3 7.3M8.7 13.3L15.3 16.7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Reviews / Tracker Icon
export function ReviewsIcon({ size = 20, color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M8.5 12.5L11 15L15.5 9.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Team / Users Icon
export function TeamIcon({ size = 20, color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <circle cx="9" cy="8" r="4" stroke={color} strokeWidth="2" />
      <path d="M3 20C3 16.6863 5.68629 14 9 14C12.3137 14 15 16.6863 15 20" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 11C17.6569 11 19 9.65685 19 8C19 6.34315 17.6569 5 16 5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M18 14C19.784 14.5 21 16.1 21 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Trash / Reporting Icon (from Reporting.svg)
export function TrashIcon({ size = 20, color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M19 8L18.1327 20.1425C18.0579 21.1891 17.187 22 16.1378 22H7.8622C6.81301 22 5.94211 21.1891 5.8673 20.1425L5 8M10 12V18M14 12V18M15 8V5C15 4.44772 14.5523 4 14 4H10C9.44772 4 9 4.44772 9 5V8M4 8H20"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Settings Icon (from Icon Outlines-8.svg)
export function SettingsIcon({ size = 20, color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M10.3246 4.31731C10.751 2.5609 13.249 2.5609 13.6754 4.31731C13.9508 5.45193 15.2507 5.99038 16.2478 5.38285C17.7913 4.44239 19.5576 6.2087 18.6172 7.75218C18.0096 8.74925 18.5481 10.0492 19.6827 10.3246C21.4391 10.751 21.4391 13.249 19.6827 13.6754C18.5481 13.9508 18.0096 15.2507 18.6172 16.2478C19.5576 17.7913 17.7913 19.5576 16.2478 18.6172C15.2507 18.0096 13.9508 18.5481 13.6754 19.6827C13.249 21.4391 10.751 21.4391 10.3246 19.6827C10.0492 18.5481 8.74926 18.0096 7.75219 18.6172C6.2087 19.5576 4.44239 17.7913 5.38285 16.2478C5.99038 15.2507 5.45193 13.9508 4.31731 13.6754C2.5609 13.249 2.5609 10.751 4.31731 10.3246C5.45193 10.0492 5.99037 8.74926 5.38285 7.75218C4.44239 6.2087 6.2087 4.44239 7.75219 5.38285C8.74926 5.99037 10.0492 5.45193 10.3246 4.31731Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// Help / Megaphone Icon (from Question.svg)
export function HelpIcon({ size = 20, color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M19.5 5.5C19.5 5.1 19.3 4.7 18.9 4.5C18.5 4.3 18.1 4.3 17.7 4.5L9.5 8.6H5.5C3.8 8.6 2.5 9.9 2.5 11.6C2.5 13.3 3.8 14.6 5.5 14.6H5.8L7.7 20.2C7.8 20.6 8.2 20.9 8.7 20.9H9.7C10.3 20.9 10.7 20.4 10.7 19.8V15.2L17.7 18.7C18.1 18.9 18.5 18.9 18.9 18.7C19.3 18.5 19.5 18.1 19.5 17.7V5.5Z"
        fill={color}
      />
    </svg>
  );
}

// Folder Card Icon (from Card1.svg)
export function FolderIcon({ size = 28, color = "#4876F3", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 0C2.23858 0 0 2.23858 0 5V25C0 27.7614 2.23858 30 5 30H35C37.7614 30 40 27.7614 40 25V10C40 7.23858 37.7614 5 35 5H22.5L17.5 0H5ZM15 15C13.6193 15 12.5 16.1193 12.5 17.5C12.5 18.8807 13.6193 20 15 20H25C26.3807 20 27.5 18.8807 27.5 17.5C27.5 16.1193 26.3807 15 25 15H15Z"
        fill={color}
      />
    </svg>
  );
}

// More Options (3 Dots Horizontal from Icon Outlines.svg)
export function MoreOptionsIcon({ size = 20, color = "#9A9DA0", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <circle cx="4.167" cy="10" r="1.25" fill={color} />
      <circle cx="10" cy="10" r="1.25" fill={color} />
      <circle cx="15.833" cy="10" r="1.25" fill={color} />
    </svg>
  );
}

// Search Icon
export function SearchIcon({ size = 18, color = "#9A9DA0", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <circle cx="9" cy="9" r="6" stroke={color} strokeWidth="1.75" />
      <path d="M13.5 13.5L17.5 17.5" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

// Video Cut Icon (Amber)
export function VideoCutIcon({ size = 18, color = "#FFBB56", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect x="2" y="4" width="12" height="12" rx="3" stroke={color} strokeWidth="1.75" />
      <path d="M14 8L18 5.5V14.5L14 12V8Z" fill={color} />
    </svg>
  );
}

// Review / Changes Requested Icon (Pink)
export function ReviewFeedbackIcon({ size = 18, color = "#FA457B", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M3 5C3 3.89543 3.89543 3 5 3H15C16.1046 3 17 3.89543 17 5V13C17 14.1046 16.1046 15 15 15H7L3 18V5Z"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="9" r="1" fill={color} />
      <circle cx="10" cy="9" r="1" fill={color} />
      <circle cx="12.5" cy="9" r="1" fill={color} />
    </svg>
  );
}

// Document / Script Icon (Purple)
export function DocumentIcon({ size = 18, color = "#9787FF", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M4 4C4 2.89543 4.89543 2 6 2H11L16 7V16C16 17.1046 15.1046 18 14 18H6C4.89543 18 4 17.1046 4 16V4Z"
        stroke={color}
        strokeWidth="1.75"
      />
      <path d="M11 2V7H16" stroke={color} strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M7 11H13M7 14H11" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

// Cloud Upload Icon (from File5.svg & Upload File.svg)
export function CloudUploadIcon({ size = 20, color = "#4876F3", className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M7 16C4.79086 16 3 14.2091 3 12C3 9.95754 4.53153 8.27278 6.51654 8.03158C7.03964 5.72659 9.10237 4 11.5625 4C14.394 4 16.7329 6.22383 16.8672 9.04351C18.6653 9.47963 20 11.0858 20 13C20 15.2091 18.2091 17 16 17H15"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M12 12V21M12 12L9 15M12 12L15 15" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
