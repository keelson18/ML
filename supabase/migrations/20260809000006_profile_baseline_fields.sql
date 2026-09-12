-- Complete identity profile fields without changing existing user data.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'USD';