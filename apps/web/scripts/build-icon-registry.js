const fs = require('fs');
const path = require('path');

const svgDir = path.resolve(__dirname, '../node_modules/@material-symbols/svg-400/outlined');
const targetFile = path.resolve(__dirname, '../src/components/ui/icon-data.ts');

const MAPPING = {
  // Navigation & Actions
  ArrowLeft: 'arrow_back',
  ArrowRight: 'arrow_forward',
  ArrowUp: 'arrow_upward',
  ArrowUpDown: 'swap_vert',
  ChevronDown: 'keyboard_arrow_down',
  ChevronLeft: 'keyboard_arrow_left',
  ChevronRight: 'keyboard_arrow_right',
  ChevronUp: 'keyboard_arrow_up',
  ChevronsUpDown: 'unfold_more',
  Close: 'close',
  X: 'close',
  Plus: 'add',
  Minus: 'remove',
  Check: 'check',
  CheckCircle2: 'check_circle',
  CheckSquare: 'check_box',
  Search: 'search',
  Menu: 'menu',
  MoreHorizontal: 'more_horiz',
  Home: 'home',
  Settings: 'settings',
  LogOut: 'logout',
  RotateCcw: 'undo',
  RotateCw: 'redo',
  Share2: 'share',
  Download: 'download',
  Upload: 'upload',
  UploadCloud: 'upload',
  Copy: 'content_copy',
  ExternalLink: 'open_in_new',
  Link: 'link',
  Link2: 'link',
  Send: 'send',
  AtSign: 'alternate_email',
  
  // Media & Review
  Play: 'play_arrow',
  Pause: 'pause',
  Video: 'videocam',
  Film: 'movie',
  Clapperboard: 'movie',
  Music: 'music_note',
  Image: 'image',
  Volume2: 'volume_up',
  VolumeX: 'volume_off',
  Maximize2: 'fullscreen',
  Minimize2: 'fullscreen_exit',
  Pen: 'edit',
  Move: 'open_with',
  MoveRight: 'arrow_forward',
  Square: 'square',
  Circle: 'circle',
  Camera: 'photo_camera',
  
  // Files, Folders, Documents, Sheets
  Folder: 'folder',
  FolderOpen: 'folder_open',
  FolderPlus: 'create_new_folder',
  FolderDown: 'folder',
  FolderInput: 'drive_file_move',
  FolderOutput: 'drive_file_move',
  FolderUp: 'drive_folder_upload',
  File: 'description',
  FileText: 'description',
  FileSpreadsheet: 'table_chart',
  Table: 'table_chart',
  Columns: 'view_column',
  FileImage: 'image',
  FileVideo: 'video_file',
  FileAudio: 'audio_file',
  FileCode: 'code',
  FilePlus: 'note_add',
  FileQuestion: 'help',
  
  // People & Organization
  User: 'person',
  Users: 'group',
  UserCheck: 'how_to_reg',
  UserPlus: 'person_add',
  Building2: 'domain',
  Shield: 'shield',
  ShieldCheck: 'verified_user',
  Lock: 'lock',
  Globe: 'language',
  
  // Formatting & Tools
  Bold: 'format_bold',
  Italic: 'format_italic',
  Underline: 'format_underlined',
  Strikethrough: 'format_strikethrough',
  AlignLeft: 'format_align_left',
  AlignCenter: 'format_align_center',
  AlignRight: 'format_align_right',
  List: 'format_list_bulleted',
  ListOrdered: 'format_list_numbered',
  Heading1: 'title',
  Heading2: 'title',
  Heading3: 'title',
  Highlighter: 'border_color',
  Palette: 'palette',
  
  // Feedback & Status
  AlertCircle: 'error',
  AlertTriangle: 'warning',
  Info: 'info',
  Clock: 'schedule',
  History: 'history',
  Bell: 'notifications',
  Star: 'star',
  Trash2: 'delete',
  Tag: 'label',
  Calendar: 'calendar_today',
  ClipboardList: 'assignment',
  MessageSquare: 'chat_bubble',
  Database: 'database',
  Filter: 'filter_list',
  Sliders: 'tune',
  Layers: 'layers',
  LayoutGrid: 'grid_view',
  Loader2: 'progress_activity',
  Moon: 'dark_mode',
  Sun: 'light_mode',
  Sparkles: 'flare',
  Zap: 'bolt',
  Eye: 'visibility',
  EyeOff: 'visibility_off',
  Edit: 'edit',
  Edit2: 'edit',
  Edit3: 'edit',
  Printer: 'print',
  Mail: 'mail',
  CornerDownRight: 'subdirectory_arrow_right',
  PanelLeft: 'dock_to_right',
  Smartphone: 'mobile',

  // Canonical Material Symbol Names (direct pass-through)
  home: 'home',
  task_alt: 'task_alt',
  TaskAlt: 'task_alt',
  video_library: 'video_library',
  VideoLibrary: 'video_library',
  group: 'group',
  groups: 'groups',
  Groups: 'groups',
  description: 'description',
  Description: 'description',
  link: 'link',
  delete: 'delete',
  Delete: 'delete',
  admin_panel_settings: 'admin_panel_settings',
  AdminPanelSettings: 'admin_panel_settings',
  shield_person: 'shield_person',
  ShieldPerson: 'shield_person',
  cloud: 'cloud',
  Cloud: 'cloud',
  settings: 'settings',
  create_new_folder: 'create_new_folder',
  CreateNewFolder: 'create_new_folder',
  person_add: 'person_add',
  PersonAdd: 'person_add',
  upload_file: 'upload_file',
  UploadFile: 'upload_file',
  drive_folder_upload: 'drive_folder_upload',
  DriveFolderUpload: 'drive_folder_upload',
  add: 'add',
  close: 'close',
  unfold_more: 'unfold_more',
  UnfoldMore: 'unfold_more',
  logout: 'logout',
  chat_bubble: 'chat_bubble',
  ChatBubble: 'chat_bubble',
  more_horiz: 'more_horiz',
  check: 'check',
  remove: 'remove',
  check_circle: 'check_circle',
  search: 'search',
  menu: 'menu',
  undo: 'undo',
  Undo: 'undo',
  redo: 'redo',
  Redo: 'redo',
  share: 'share',
  Share: 'share',
  download: 'download',
  upload: 'upload',
  content_copy: 'content_copy',
  open_in_new: 'open_in_new',
  send: 'send',
  alternate_email: 'alternate_email',
  play_arrow: 'play_arrow',
  pause: 'pause',
  videocam: 'videocam',
  movie: 'movie',
  music_note: 'music_note',
  image: 'image',
  volume_up: 'volume_up',
  volume_off: 'volume_off',
  fullscreen: 'fullscreen',
  fullscreen_exit: 'fullscreen_exit',
  edit: 'edit',
  open_with: 'open_with',
  arrow_forward: 'arrow_forward',
  square: 'square',
  circle: 'circle',
  folder: 'folder',
  folder_open: 'folder_open',
  FolderOpen: 'folder_open',
  folder_shared: 'folder_shared',
  FolderShared: 'folder_shared',
  table_chart: 'table_chart',
  TableChart: 'table_chart',
  view_column: 'view_column',
  video_file: 'video_file',
  audio_file: 'audio_file',
  code: 'code',
  note_add: 'note_add',
  help: 'help',
  Help: 'help',
  hard_drive: 'hard_drive',
  HardDrive: 'hard_drive',
  corporate_fare: 'corporate_fare',
  CorporateFare: 'corporate_fare',
  rate_review: 'rate_review',
  RateReview: 'rate_review',
  attach_file: 'attach_file',
  Paperclip: 'attach_file',
  photo_camera: 'photo_camera',
  language: 'language',
  verified_user: 'verified_user',
  palette: 'palette',
  arrow_upward: 'arrow_upward',
  arrow_back: 'arrow_back',
  swap_vert: 'swap_vert',
  keyboard_arrow_down: 'keyboard_arrow_down',
  keyboard_arrow_left: 'keyboard_arrow_left',
  keyboard_arrow_right: 'keyboard_arrow_right',
  keyboard_arrow_up: 'keyboard_arrow_up',
  format_bold: 'format_bold',
  format_italic: 'format_italic',
  format_underlined: 'format_underlined',
  format_strikethrough: 'format_strikethrough',
  format_align_left: 'format_align_left',
  format_align_center: 'format_align_center',
  format_align_right: 'format_align_right',
  format_list_bulleted: 'format_list_bulleted',
  format_list_numbered: 'format_list_numbered',
  title: 'title',
  border_color: 'border_color',
  error: 'error',
  warning: 'warning',
  info: 'info',
  schedule: 'schedule',
  history: 'history',
  notifications: 'notifications',
  star: 'star',
  label: 'label',
  calendar_today: 'calendar_today',
  assignment: 'assignment',
  database: 'database',
  filter_list: 'filter_list',
  tune: 'tune',
  layers: 'layers',
  grid_view: 'grid_view',
  progress_activity: 'progress_activity',
  dark_mode: 'dark_mode',
  light_mode: 'light_mode',
  flare: 'flare',
  bolt: 'bolt',
  visibility: 'visibility',
  visibility_off: 'visibility_off',
  print: 'print',
  mail: 'mail',
  subdirectory_arrow_right: 'subdirectory_arrow_right',
  dock_to_right: 'dock_to_right',
  mobile: 'mobile',
};

// All unique Material Symbol names to extract from SVG directory
const uniqueSymbols = new Set(Object.values(MAPPING));

// Extract path from SVG content
function extractPath(svgPath) {
  if (!fs.existsSync(svgPath)) return null;
  const content = fs.readFileSync(svgPath, 'utf8');
  const m = content.match(/<path\s+d="([^"]+)"/);
  return m ? m[1] : null;
}

const registry = {};

for (const sym of uniqueSymbols) {
  const outlineFile = path.join(svgDir, sym + '.svg');
  const fillFile = path.join(svgDir, sym + '-fill.svg');
  
  const outlinePath = extractPath(outlineFile);
  const fillPath = extractPath(fillFile) || outlinePath;

  if (outlinePath) {
    registry[sym] = {
      outline: outlinePath,
      fill: fillPath,
    };
  } else {
    console.warn('Missing SVG for:', sym);
  }
}

console.log('Total Material Symbols Outlined compiled:', Object.keys(registry).length);

const output = `// Auto-generated Google Material Symbols Outlined (Weight 400) Icon Data
// Single source of truth for SVG paths with zero network latency & zero font flash

export interface IconPathData {
  outline: string;
  fill: string;
}

export const MATERIAL_SYMBOLS_DATA: Record<string, IconPathData> = ${JSON.stringify(registry, null, 2)};

export const ICON_NAME_MAP: Record<string, string> = ${JSON.stringify(MAPPING, null, 2)};
`;

fs.writeFileSync(targetFile, output, 'utf8');
console.log('Saved Outlined icon data to', targetFile);
