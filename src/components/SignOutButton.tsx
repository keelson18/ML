import { LogOut } from 'lucide-react';

interface Props {
  onSignOut: () => void;
  variant?: 'sidebar' | 'menu' | 'mobile';
}

/** One sign-out control, with the markup each surrounding menu/nav needs. */
export default function SignOutButton({ onSignOut, variant = 'sidebar' }: Props) {
  if (variant === 'menu') {
    return <button type="button" role="menuitem" onClick={onSignOut} className="account-menu-action is-danger"><LogOut aria-hidden="true" /><span>Sign out</span></button>;
  }
  if (variant === 'mobile') {
    return <button type="button" onClick={onSignOut} className="mobile-sign-out"><LogOut aria-hidden="true" /><span>Sign out</span></button>;
  }
  return <button type="button" onClick={onSignOut} className="sidebar-sign-out"><LogOut aria-hidden="true" /><span>Sign out</span></button>;
}
