import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
}

// Official Playhead Brand Icon (from playhead-icon-white.svg)
export function PlayheadIcon({
  size = 32,
  color = "currentColor",
  className,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <title>Playhead</title>
      <g transform="translate(0 6.5)">
        <path
          fillRule="evenodd"
          d="M12.000 12.000Q12.000 5.000 19.000 5.000L45.000 5.000Q52.000 5.000 52.000 12.000L52.000 29.000Q52.000 31.000 50.400 32.200L34.400 44.200Q32.000 46.000 29.600 44.200L13.600 32.200Q12.000 31.000 12.000 29.000ZM25.500 16.662Q25.500 12.000 29.466 14.450L38.919 20.288Q42.500 22.500 38.919 24.712L29.466 30.550Q25.500 33.000 25.500 28.338Z"
        />
      </g>
    </svg>
  );
}

// Alias for backwards compatibility
export const PlayheadLogo = PlayheadIcon;

// Official Playhead Brand Logo with Text (from playhead-logo-white.svg)
export function PlayheadLogoWithText({
  width = 140,
  height,
  color = "currentColor",
  className,
  ...props
}: IconProps & { width?: number; height?: number }) {
  const computedHeight = height || Math.round((width * 51.85) / 277.13);
  return (
    <svg
      width={width}
      height={computedHeight}
      viewBox="10.00 7.15 277.13 51.85"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <title>Playhead</title>
      <g transform="translate(0.9220 9.8091) scale(0.9232)">
        <path
          fillRule="evenodd"
          d="M12.000 12.000Q12.000 5.000 19.000 5.000L45.000 5.000Q52.000 5.000 52.000 12.000L52.000 29.000Q52.000 31.000 50.400 32.200L34.400 44.200Q32.000 46.000 29.600 44.200L13.600 32.200Q12.000 31.000 12.000 29.000ZM25.500 16.662Q25.500 12.000 29.466 14.450L38.919 20.288Q42.500 22.500 38.919 24.712L29.466 30.550Q25.500 33.000 25.500 28.338Z"
        />
      </g>
      <path d="M65.67682926829269 57.0V19.7H72.67682926829269V22.549999999999997Q73.87682926829268 21.099999999999998 75.72682926829269 20.2Q78.02682926829269 19.099999999999998 81.02682926829269 19.099999999999998Q84.92682926829269 19.099999999999998 88.0768292682927 21.0Q91.22682926829269 22.9 93.0768292682927 26.125Q94.92682926829269 29.349999999999998 94.92682926829269 33.35Q94.92682926829269 37.3 93.10182926829269 40.55Q91.27682926829269 43.8 88.12682926829268 45.7Q84.97682926829269 47.6 80.97682926829269 47.6Q78.17682926829269 47.6 75.82682926829268 46.55Q74.32682926829268 45.95 73.17682926829269 44.9V57.0ZM80.07682926829268 40.85Q82.17682926829269 40.85 83.77682926829269 39.900000000000006Q85.37682926829268 38.95 86.27682926829269 37.25Q87.17682926829269 35.55 87.17682926829269 33.349999999999994Q87.17682926829269 31.15 86.27682926829269 29.474999999999998Q85.37682926829268 27.799999999999997 83.77682926829269 26.824999999999996Q82.17682926829269 25.849999999999998 80.07682926829268 25.849999999999998Q78.07682926829268 25.849999999999998 76.50182926829268 26.799999999999997Q74.92682926829269 27.75 74.05182926829269 29.45Q73.17682926829269 31.15 73.17682926829269 33.349999999999994Q73.17682926829269 35.55 74.05182926829269 37.25Q74.92682926829269 38.95 76.50182926829268 39.900000000000006Q78.07682926829268 40.85 80.07682926829268 40.85ZM98.32682926829268 47.0V9.149999999999999H105.82682926829268V47.0ZM118.77682926829269 47.6Q115.82682926829268 47.6 113.67682926829269 46.650000000000006Q111.52682926829269 45.7 110.37682926829268 43.925Q109.22682926829269 42.15 109.22682926829269 39.7Q109.22682926829269 37.4 110.27682926829269 35.625Q111.32682926829268 33.85 113.50182926829268 32.65Q115.67682926829268 31.45 118.92682926829269 30.95L126.47682926829269 29.75V29.0Q126.47682926829269 27.45 125.25182926829268 26.4Q124.02682926829269 25.349999999999998 121.92682926829269 25.349999999999998Q119.92682926829269 25.349999999999998 118.40182926829269 26.449999999999996Q116.87682926829268 27.549999999999997 116.17682926829268 29.349999999999998L110.17682926829268 26.5Q110.97682926829269 24.2 112.72682926829269 22.549999999999997Q114.47682926829269 20.9 116.92682926829269 20.0Q119.37682926829268 19.099999999999998 122.27682926829269 19.099999999999998Q125.72682926829269 19.099999999999998 128.37682926829268 20.349999999999998Q131.0268292682927 21.599999999999998 132.50182926829268 23.824999999999996Q133.97682926829268 26.049999999999997 133.97682926829268 29.0V47.0H126.97682926829269V44.4Q126.52682926829269 44.9 126.02682926829269 45.25Q124.57682926829268 46.45 122.77682926829269 47.025000000000006Q120.97682926829269 47.6 118.77682926829269 47.6ZM126.47682926829269 35.25 120.27682926829269 36.35Q118.67682926829269 36.65 117.8268292682927 37.375Q116.97682926829269 38.1 116.97682926829269 39.45Q116.97682926829269 40.7 117.92682926829269 41.400000000000006Q118.87682926829268 42.1 120.27682926829269 42.1Q122.12682926829268 42.1 123.52682926829269 41.3Q124.92682926829269 40.5 125.7018292682927 39.125Q126.47682926829269 37.75 126.47682926829269 36.1ZM142.72682926829268 58.0Q141.5268292682927 58.0 140.4018292682927 57.8Q139.2768292682927 57.6 138.42682926829266 57.15V51.0Q139.12682926829268 51.2 140.07682926829267 51.35Q141.0268292682927 51.5 141.82682926829267 51.5Q144.0268292682927 51.5 144.97682926829268 50.475Q145.92682926829266 49.45 146.5268292682927 48.15L147.0268292682927 47.0L136.2768292682927 19.7H144.32682926829267L150.7768292682927 37.25L157.22682926829268 19.7H165.2768292682927L153.57682926829267 49.55Q152.47682926829268 52.35 150.87682926829268 54.25Q149.2768292682927 56.15 147.25182926829268 57.075Q145.22682926829268 58.0 142.72682926829268 58.0ZM167.57682926829267 47.0V9.149999999999999H175.07682926829267V22.2Q175.92682926829266 21.0 177.27682926829266 20.25Q179.37682926829268 19.099999999999998 182.22682926829268 19.099999999999998Q185.32682926829267 19.099999999999998 187.65182926829266 20.4Q189.97682926829268 21.7 191.27682926829266 24.025Q192.57682926829267 26.349999999999998 192.57682926829267 29.45V47.0H185.07682926829267V31.049999999999997Q185.07682926829267 29.45 184.45182926829267 28.299999999999997Q183.82682926829267 27.15 182.70182926829267 26.5Q181.57682926829267 25.849999999999998 180.07682926829267 25.849999999999998Q178.62682926829268 25.849999999999998 177.47682926829268 26.5Q176.32682926829267 27.15 175.70182926829267 28.299999999999997Q175.07682926829267 29.45 175.07682926829267 31.049999999999997V47.0ZM209.67682926829266 47.6Q205.32682926829267 47.6 202.12682926829268 45.675Q198.92682926829266 43.75 197.17682926829266 40.5Q195.42682926829266 37.25 195.42682926829266 33.3Q195.42682926829266 29.2 197.25182926829268 26.0Q199.07682926829267 22.799999999999997 202.17682926829266 20.949999999999996Q205.27682926829266 19.099999999999998 209.17682926829266 19.099999999999998Q212.42682926829266 19.099999999999998 214.92682926829266 20.125Q217.42682926829266 21.15 219.15182926829266 23.0Q220.87682926829265 24.849999999999998 221.77682926829266 27.275Q222.67682926829266 29.7 222.67682926829266 32.55Q222.67682926829266 33.35 222.60182926829265 34.125Q222.52682926829266 34.9 222.32682926829267 35.45H203.22682926829265Q203.32682926829267 36.5 203.72682926829265 37.4Q204.47682926829265 39.15 206.02682926829266 40.125Q207.57682926829267 41.1 209.77682926829266 41.1Q211.77682926829266 41.1 213.20182926829267 40.3Q214.62682926829265 39.5 215.42682926829266 38.1L221.42682926829266 40.95Q220.62682926829265 42.95 218.90182926829266 44.45Q217.17682926829266 45.95 214.82682926829267 46.775000000000006Q212.47682926829265 47.6 209.67682926829266 47.6ZM203.37682926829265 29.95H214.72682926829265Q214.67682926829266 29.3 214.47682926829265 28.7Q213.92682926829266 27.049999999999997 212.55182926829266 26.074999999999996Q211.17682926829266 25.099999999999998 209.17682926829266 25.099999999999998Q207.22682926829265 25.099999999999998 205.82682926829267 26.049999999999997Q204.42682926829266 27.0 203.72682926829265 28.849999999999998Q203.52682926829266 29.349999999999998 203.37682926829265 29.95ZM234.52682926829266 47.6Q231.57682926829267 47.6 229.42682926829266 46.650000000000006Q227.27682926829266 45.7 226.12682926829268 43.925Q224.97682926829268 42.15 224.97682926829268 39.7Q224.97682926829268 37.4 226.02682926829266 35.625Q227.07682926829267 33.85 229.25182926829268 32.65Q231.42682926829266 31.45 234.67682926829266 30.95L242.22682926829268 29.75V29.0Q242.22682926829268 27.45 241.00182926829268 26.4Q239.77682926829266 25.349999999999998 237.67682926829266 25.349999999999998Q235.67682926829266 25.349999999999998 234.15182926829266 26.449999999999996Q232.62682926829268 27.549999999999997 231.92682926829266 29.349999999999998L225.92682926829266 26.5Q226.72682926829268 24.2 228.47682926829268 22.549999999999997Q230.22682926829268 20.9 232.6768292682927 20.0Q235.12682926829268 19.099999999999998 238.02682926829266 19.099999999999998Q241.47682926829268 19.099999999999998 244.12682926829268 20.349999999999998Q246.77682926829266 21.599999999999998 248.25182926829268 23.824999999999996Q249.72682926829268 26.049999999999997 249.72682926829268 29.0V47.0H242.72682926829268V44.4Q242.27682926829266 44.9 241.77682926829266 45.25Q240.32682926829267 46.45 238.52682926829266 47.025000000000006Q236.72682926829268 47.6 234.52682926829266 47.6ZM242.22682926829268 35.25 236.02682926829266 36.35Q234.42682926829266 36.65 233.57682926829267 37.375Q232.72682926829268 38.1 232.72682926829268 39.45Q232.72682926829268 40.7 233.6768292682927 41.400000000000006Q234.62682926829268 42.1 236.02682926829266 42.1Q237.87682926829268 42.1 239.27682926829266 41.3Q240.67682926829266 40.5 241.45182926829267 39.125Q242.22682926829268 37.75 242.22682926829268 36.1ZM267.07682926829267 47.6Q263.07682926829267 47.6 259.92682926829264 45.7Q256.77682926829266 43.8 254.95182926829267 40.55Q253.12682926829268 37.3 253.12682926829268 33.35Q253.12682926829268 29.349999999999998 254.97682926829268 26.125Q256.82682926829267 22.9 259.9768292682927 21.0Q263.1268292682927 19.099999999999998 267.02682926829266 19.099999999999998Q270.02682926829266 19.099999999999998 272.3768292682927 20.2Q273.82682926829267 20.95 274.8768292682927 22.0V9.149999999999999H282.3768292682927V47.0H275.3768292682927V44.4Q274.1268292682927 45.8 272.27682926829266 46.55Q269.8768292682927 47.6 267.07682926829267 47.6ZM267.9768292682927 40.85Q270.02682926829266 40.85 271.57682926829267 39.900000000000006Q273.1268292682927 38.95 274.0018292682927 37.25Q274.8768292682927 35.55 274.8768292682927 33.349999999999994Q274.8768292682927 31.15 274.0018292682927 29.45Q273.1268292682927 27.75 271.57682926829267 26.799999999999997Q270.02682926829266 25.849999999999998 267.9768292682927 25.849999999999998Q265.9268292682927 25.849999999999998 264.3018292682927 26.824999999999996Q262.6768292682927 27.799999999999997 261.77682926829266 29.474999999999998Q260.8768292682927 31.15 260.8768292682927 33.349999999999994Q260.8768292682927 35.55 261.77682926829266 37.25Q262.6768292682927 38.95 264.3018292682927 39.900000000000006Q265.9268292682927 40.85 267.9768292682927 40.85Z" />
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
export function MoreOptionsIcon({ size = 20, color = "#A3A6AD", className, ...props }: IconProps) {
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
export function SearchIcon({ size = 18, color = "#A3A6AD", className, ...props }: IconProps) {
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

interface FileIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  withBackground?: boolean;
}

// Video File Icon (from videos.svg in Storage Dashboard V3)
export function VideoFileIcon({
  size = 32,
  color = "#FFBB56",
  withBackground = true,
  className,
  ...props
}: FileIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 53 53"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {withBackground && (
        <circle opacity="0.1" cx="26.5" cy="26.5" r="26.5" fill={color} />
      )}
      <path
        d="M14.3 19.9C14.3 18.0775 15.7775 16.6 17.6 16.6H27.5C29.3226 16.6 30.8 18.0775 30.8 19.9V33.1C30.8 34.9225 29.3226 36.4 27.5 36.4H17.6C15.7775 36.4 14.3 34.9225 14.3 33.1V19.9Z"
        fill={color}
      />
      <path
        d="M35.0121 21.7242C34.4532 22.0037 34.1 22.575 34.1 23.2V29.8C34.1 30.425 34.4532 30.9963 35.0121 31.2758L38.3121 32.9258C38.8236 33.1816 39.4311 33.1542 39.9175 32.8536C40.404 32.5529 40.7 32.0219 40.7 31.45V21.55C40.7 20.9782 40.404 20.4471 39.9175 20.1464C39.4311 19.8458 38.8236 19.8185 38.3121 20.0742L35.0121 21.7242Z"
        fill={color}
      />
    </svg>
  );
}

// PDF / Document File Icon (from Document.svg in Storage Dashboard V3)
export function PdfFileIcon({
  size = 32,
  color = "#4876F3",
  withBackground = true,
  className,
  ...props
}: FileIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 53 53"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {withBackground && (
        <circle opacity="0.1" cx="26.5" cy="26.5" r="26.5" fill={color} />
      )}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17 17.9C17 16.2984 18.2984 15 19.9 15H26.5494C27.3185 15 28.0561 15.3055 28.6 15.8494L33.5506 20.8C34.0945 21.3439 34.4 22.0815 34.4 22.8506V35.3C34.4 36.9016 33.1016 38.2 31.5 38.2H19.9C18.2984 38.2 17 36.9016 17 35.3V17.9Z"
        fill={color}
      />
    </svg>
  );
}

// Image File Icon (from Images.svg in Storage Dashboard V3)
export function ImageFileIcon({
  size = 32,
  color = "#FA457B",
  withBackground = true,
  className,
  ...props
}: FileIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 53 53"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {withBackground && (
        <circle opacity="0.1" cx="26.5" cy="26.5" r="26.5" fill={color} />
      )}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17 14.25C15.067 14.25 13.5 15.817 13.5 17.75V35.25C13.5 37.183 15.067 38.75 17 38.75H38C39.933 38.75 41.5 37.183 41.5 35.25V17.75C41.5 15.817 39.933 14.25 38 14.25H17ZM38 35.25H17L24 21.25L29.25 31.75L32.75 24.75L38 35.25Z"
        fill={color}
      />
    </svg>
  );
}

// Audio File Icon (from Music.svg in Storage Dashboard V3)
export function AudioFileIcon({
  size = 32,
  color = "#9787FF",
  withBackground = true,
  className,
  ...props
}: FileIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 53 53"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {withBackground && (
        <circle opacity="0.1" cx="26.5" cy="26.5" r="26.5" fill={color} />
      )}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M25.1357 16.3066C25.6588 16.5233 25.9999 17.0338 25.9999 17.6V34.4C25.9999 34.9663 25.6588 35.4768 25.1357 35.6935C24.6125 35.9102 24.0104 35.7904 23.61 35.39L18.42 30.2H14.7999C14.0267 30.2 13.3999 29.5732 13.3999 28.8V23.2C13.3999 22.4268 14.0267 21.8 14.7999 21.8H18.42L23.61 16.6101C24.0104 16.2097 24.6125 16.0899 25.1357 16.3066Z"
        fill={color}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M32.5195 16.1004C33.0662 15.5537 33.9526 15.5537 34.4994 16.1004C37.0313 18.6324 38.5999 22.1343 38.5999 25.9999C38.5999 29.8655 37.0313 33.3674 34.4994 35.8994C33.9526 36.4461 33.0662 36.4461 32.5195 35.8994C31.9727 35.3527 31.9727 34.4662 32.5195 33.9195C34.5478 31.8912 35.7999 29.0931 35.7999 25.9999C35.7999 22.9067 34.5478 20.1087 32.5195 18.0803C31.9727 17.5336 31.9727 16.6472 32.5195 16.1004ZM28.5597 20.0602C29.1064 19.5135 29.9928 19.5135 30.5396 20.0602C31.2758 20.7964 31.8766 21.6696 32.3003 22.6394C32.7507 23.6703 32.9999 24.8078 32.9999 25.9999C32.9999 28.3191 32.0582 30.421 30.5396 31.9396C29.9928 32.4863 29.1064 32.4863 28.5597 31.9396C28.0129 31.3929 28.0129 30.5064 28.5597 29.9597C29.5746 28.9448 30.1999 27.5467 30.1999 25.9999C30.1999 25.2009 30.0334 24.4444 29.7345 23.7604C29.4527 23.1154 29.0521 22.5326 28.5597 22.0401C28.0129 21.4934 28.0129 20.607 28.5597 20.0602Z"
        fill={color}
      />
    </svg>
  );
}

// Smart File Type Badge component that automatically renders the right icon
export function FileTypeBadge({
  type,
  size = 32,
  color,
  withBackground = true,
  className,
}: {
  type: string;
  size?: number;
  color?: string;
  withBackground?: boolean;
  className?: string;
}) {
  const normalized = type.toLowerCase();
  if (
    normalized === "video" ||
    normalized === "mp4" ||
    normalized === "mov" ||
    normalized === "mkv"
  ) {
    return (
      <VideoFileIcon
        size={size}
        color={color || "#FFBB56"}
        withBackground={withBackground}
        className={className}
      />
    );
  }
  if (
    normalized === "pdf" ||
    normalized === "doc" ||
    normalized === "docx" ||
    normalized === "txt"
  ) {
    return (
      <PdfFileIcon
        size={size}
        color={color || "#4876F3"}
        withBackground={withBackground}
        className={className}
      />
    );
  }
  if (
    normalized === "image" ||
    normalized === "png" ||
    normalized === "jpg" ||
    normalized === "jpeg" ||
    normalized === "gif"
  ) {
    return (
      <ImageFileIcon
        size={size}
        color={color || "#FA457B"}
        withBackground={withBackground}
        className={className}
      />
    );
  }
  if (
    normalized === "audio" ||
    normalized === "wav" ||
    normalized === "mp3" ||
    normalized === "aac" ||
    normalized === "flac"
  ) {
    return (
      <AudioFileIcon
        size={size}
        color={color || "#9787FF"}
        withBackground={withBackground}
        className={className}
      />
    );
  }
  return (
    <PdfFileIcon
      size={size}
      color={color || "#4876F3"}
      withBackground={withBackground}
      className={className}
    />
  );
}
