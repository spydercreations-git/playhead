const fs = require('fs');
const path = require('path');

const svgDir = path.resolve(__dirname, '../node_modules/@material-symbols/svg-300/rounded');
const targetFile = path.resolve(__dirname, '../src/components/ui/icon-data.ts');

const MAPPING = {
  // Navigation & Actions
  ArrowLeft: 'arrow_back',
  ArrowRight: 'arrow_forward',
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
  Building2: 'domain',
  Shield: 'shield',
  Lock: 'lock',
  
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
  Smartphone: 'mobile'
};

// All unique Material Symbol names
const uniqueSymbols = new Set(Object.values(MAPPING));

// Extract path
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

console.log('Total Material Symbols compiled:', Object.keys(registry).length);

const output = `// Auto-generated Google Material Symbols Rounded (Weight 300) Icon Data
// Single source of truth for SVG paths with zero network latency & zero font flash

export interface IconPathData {
  outline: string;
  fill: string;
}

export const MATERIAL_SYMBOLS_DATA: Record<string, IconPathData> = ${JSON.stringify(registry, null, 2)};

export const ICON_NAME_MAP: Record<string, string> = ${JSON.stringify(MAPPING, null, 2)};
`;

fs.writeFileSync(targetFile, output, 'utf8');
console.log('Saved icon data to', targetFile);
