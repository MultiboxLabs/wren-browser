// An icon for each of Chromium's permissions and settings (its content
// settings'), which page info's rows (page-info.tsx) and the prompt for them
// (permission-prompt.tsx) draw.

import {
  AppWindow,
  Bell,
  Bluetooth,
  Camera,
  Clipboard,
  Code,
  Cookie,
  Cpu,
  Download,
  ExternalLink,
  Gamepad2,
  Image,
  MapPin,
  Mic,
  Music,
  PictureInPicture2,
  Settings2,
  Type,
  Usb,
  Vibrate,
  Volume2
} from "lucide-react";
import type { Icon } from "@/components/ui/button";

// Chromium's names for permissions and settings (its content settings'),
// by a part of the name, with an icon for each.
const permissionIcons: [string, Icon][] = [
  ["geolocation", MapPin],
  ["notifications", Bell],
  ["camera", Camera],
  ["mic", Mic],
  ["popups", ExternalLink],
  ["javascript", Code],
  ["images", Image],
  ["sound", Volume2],
  ["automatic-downloads", Download],
  ["clipboard", Clipboard],
  ["midi", Music],
  ["sensors", Vibrate],
  ["picture-in-picture", PictureInPicture2],
  ["window", AppWindow],
  ["fonts", Type],
  ["usb", Usb],
  ["bluetooth", Bluetooth],
  ["hid", Gamepad2],
  ["serial", Cpu],
  ["cookies", Cookie],
  ["storage-access", Cookie]
];

export const permissionIcon = (id: string) => permissionIcons.find(([part]) => id.includes(part))?.[1] ?? Settings2;
