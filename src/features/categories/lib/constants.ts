import {
  ShoppingCart,
  Utensils,
  Car,
  Repeat,
  Home,
  Heart,
  Gamepad2,
  Plane,
  TrendingUp,
  MoreHorizontal,
  Tag,
  Wallet,
  Gift,
  BookOpen,
  Music,
  Camera,
  Phone,
  Briefcase,
  GraduationCap,
  Dumbbell,
  Coffee,
  Banknote,
  PiggyBank,
  CreditCard,
  Building2,
  Bus,
  Fuel,
  Lightbulb,
  Wrench,
  Shield,
  Baby,
  Dog,
  type LucideIcon,
} from 'lucide-react'

/**
 * 16 predefined colors for the color picker (4×4 grid).
 * Includes all 10 seed category colors plus 6 extras.
 */
export const COLOR_PALETTE = [
  '#3B82F6', // blue (Shopping)
  '#F97316', // orange (Dining)
  '#06B6D4', // cyan (Transportation)
  '#8B5CF6', // violet (Subscriptions)
  '#64748B', // slate (Housing)
  '#EF4444', // red (Health)
  '#EC4899', // pink (Entertainment)
  '#22C55E', // green (Travel)
  '#10B981', // emerald (Income)
  '#6B7280', // gray (Other)
  '#F59E0B', // amber
  '#14B8A6', // teal
  '#A855F7', // purple
  '#F43F5E', // rose
  '#84CC16', // lime
  '#0EA5E9', // sky
] as const

/**
 * Maps icon string names (stored in DB) to lucide-react components.
 * Used for rendering icons from their database string representation.
 * Fallback to Tag for unknown icon names.
 */
export const ICON_MAP: Record<string, LucideIcon> = {
  ShoppingCart,
  Utensils,
  Car,
  Repeat,
  Home,
  Heart,
  Gamepad2,
  Plane,
  TrendingUp,
  MoreHorizontal,
  Tag,
  Wallet,
  Gift,
  BookOpen,
  Music,
  Camera,
  Phone,
  Briefcase,
  GraduationCap,
  Dumbbell,
  Coffee,
  Banknote,
  PiggyBank,
  CreditCard,
  Building2,
  Bus,
  Fuel,
  Lightbulb,
  Wrench,
  Shield,
  Baby,
  Dog,
}

/** Ordered list of icon names available in the IconPicker */
export const ICON_LIST = Object.keys(ICON_MAP)

/** Default icon name for new categories */
export const DEFAULT_ICON = 'Tag'

/** Default color for new categories */
export const DEFAULT_COLOR = '#3B82F6'

/**
 * Resolves an icon name to its lucide-react component.
 * Falls back to Tag for unknown names.
 */
export const getIconComponent = (name: string): LucideIcon =>
  ICON_MAP[name] ?? Tag
