// Builds landing/assets/icons.svg, an SVG sprite of the Hugeicons the page uses.
// Usage: npm install && npm run icons
import { writeFileSync } from 'node:fs';
import * as hugeicons from '@hugeicons/core-free-icons';

// sprite id -> Hugeicons export name
const ICONS = {
  'arrow-right': 'ArrowRight02Icon',
  'arrow-up-right': 'ArrowUpRight01Icon',
  'chevron-down': 'ArrowDown01Icon',
  'chevron-right': 'ArrowRight01Icon',
  'plus': 'PlusSignIcon',
  'check': 'Tick02Icon',
  'check-circle': 'CheckmarkCircle02Icon',
  'cancel': 'Cancel01Icon',
  'alert': 'Alert02Icon',
  'info': 'InformationCircleIcon',
  'calendar': 'Calendar03Icon',
  'calendar-check': 'CalendarCheckIn01Icon',
  'calendar-remove': 'CalendarRemove01Icon',
  'clock': 'Clock01Icon',
  'hourglass': 'HourglassIcon',
  'user': 'UserIcon',
  'users': 'UserGroupIcon',
  'user-add': 'UserAdd01Icon',
  'id-card': 'IdCardIcon',
  'instagram': 'InstagramIcon',
  'telegram': 'TelegramIcon',
  'map-pin': 'MapPinIcon',
  'maps': 'MapsLocation01Icon',
  'globe': 'Globe02Icon',
  'qr': 'QrCodeIcon',
  'qr-scan': 'QrCodeScanIcon',
  'phone': 'SmartPhone01Icon',
  'call': 'Call02Icon',
  'support': 'CustomerSupportIcon',
  'chat': 'BubbleChatIcon',
  'bell': 'Notification01Icon',
  'scissor': 'ScissorIcon',
  'tooth': 'DentalToothIcon',
  'dumbbell': 'Dumbbell01Icon',
  'school': 'Mortarboard02Icon',
  'wrench': 'Wrench01Icon',
  'cleaning': 'CleaningBucketIcon',
  'dress': 'Dress03Icon',
  'hanger': 'HangerIcon',
  'hair-dryer': 'HairDryerIcon',
  'guitar': 'GuitarIcon',
  'baby': 'Baby01Icon',
  'washing-machine': 'WashingMachineIcon',
  'paw': 'PawPrintIcon',
  'restaurant': 'Restaurant01Icon',
  'coffee': 'Coffee02Icon',
  'hotel': 'Hotel01Icon',
  'flower': 'Flower01Icon',
  'leaf': 'Leaf01Icon',
  'legal': 'LegalHammerIcon',
  'paint-brush': 'PaintBrush01Icon',
  'key': 'Key01Icon',
  'glasses': 'GlassesIcon',
  'wifi-off': 'WifiDisconnected01Icon',
  'wifi': 'WifiConnected01Icon',
  'sync': 'CloudSyncIcon',
  'refresh': 'Refresh01Icon',
  'cash': 'Cash01Icon',
  'money': 'Money03Icon',
  'wallet': 'Wallet01Icon',
  'card': 'CreditCardIcon',
  'coins': 'Coins01Icon',
  'receipt': 'ReceiptTextIcon',
  'invoice': 'Invoice01Icon',
  'percent': 'CouponPercentIcon',
  'gift': 'GiftIcon',
  'calculator': 'CalculatorIcon',
  'package': 'Package01Icon',
  'package-low': 'PackageOutOfStockIcon',
  'chart': 'Analytics01Icon',
  'dashboard': 'DashboardSquare01Icon',
  'star': 'StarIcon',
  'database': 'Database01Icon',
  'shield': 'SecurityCheckIcon',
  'lock': 'SquareLock02Icon',
  'fingerprint': 'FingerprintPatternIcon',
  'store': 'Store01Icon',
  'building': 'Building03Icon',
  'language': 'LanguageSquareIcon',
  'translate': 'ChatTranslateIcon',
  'file-import': 'FileImportIcon',
  'file-export': 'FileExportIcon',
  'xls': 'Xls01Icon',
  'signature': 'SignatureIcon',
  'camera': 'Camera01Icon',
  'image': 'Image01Icon',
  'route': 'Route01Icon',
  'truck': 'DeliveryTruck01Icon',
  'ticket': 'TicketStarIcon',
  'snow': 'SnowIcon',
  'sparkles': 'SparklesIcon',
  'brain': 'Brain02Icon',
  'ai-chat': 'AiChat02Icon',
  'ai-voice': 'AiVoiceIcon',
  'mic': 'Mic01Icon',
  'stethoscope': 'StethoscopeIcon',
  'note': 'Note01Icon',
  'task': 'TaskDone01Icon',
  'checklist': 'CheckListIcon',
  'moon': 'Moon02Icon',
  'sun': 'Sun03Icon',
  'timer': 'Timer02Icon',
  'menu': 'Menu01Icon',
  'search': 'Search01Icon',
  'settings': 'Settings01Icon',
  'home': 'Home01Icon',
  'yoga': 'Yoga01Icon',
  'bank': 'BankIcon',
  'android': 'AndroidIcon',
  'apple': 'AppleIcon',
  'browser': 'BrowserIcon',
  'play-store': 'PlayStoreIcon',
  'app-store': 'AppStoreIcon',
};

// sprite id -> our own drawing, for icons Hugeicons doesn't draw the way we want.
// Strokes use currentColor and leave stroke-width to CSS, like the generated ones.
const CUSTOM = {
  'car': '<path d="M3.5 19.25C3.08579 19.25 2.75 18.9142 2.75 18.5V11.6156C2.75 11.2145 2.8706 10.8226 3.09615 10.491L6.40474 5.62538C6.77711 5.07778 7.39639 4.75 8.05859 4.75H15.9414C16.6036 4.75 17.2229 5.07778 17.5953 5.62538L20.9039 10.491C21.1294 10.8226 21.25 11.2145 21.25 11.6156V18.5C21.25 18.9142 20.9142 19.25 20.5 19.25H18C17.5858 19.25 17.25 18.9142 17.25 18.5V17.1786H6.75V18.5C6.75 18.9142 6.41421 19.25 6 19.25H3.5Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.75 10.25H3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 10.25H22.75" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.75 13.25H7.25" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.75 13.25H18.25" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>',
};

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

function toSymbol(id, nodes) {
  const children = nodes
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        // stroke width is set on the <svg> in CSS so it can be tuned per size
        .filter(([k]) => k !== 'key' && k !== 'strokeWidth')
        .map(([k, v]) => `${kebab(k)}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return `<symbol id="${id}" viewBox="0 0 24 24" fill="none">${children}</symbol>`;
}

const symbols = Object.entries(ICONS).map(([id, name]) => {
  const nodes = hugeicons[name];
  if (!nodes) throw new Error(`Unknown Hugeicons export: ${name}`);
  return toSymbol(id, nodes);
});
for (const [id, body] of Object.entries(CUSTOM)) {
  symbols.push(`<symbol id="${id}" viewBox="0 0 24 24" fill="none">${body}</symbol>`);
}

const out = `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`;
writeFileSync(new URL('../landing/assets/icons.svg', import.meta.url), out);
console.log(`Wrote ${symbols.length} icons`);
