# VoiceGen — Vercel Deployment Guide

## Step 1 — GitHub Account
github.com pe free account banao (agar nahi hai)

## Step 2 — New Repository
GitHub pe "New Repository" banao
Name: voicegen
Public repo banao
Upload saari files same structure mein

## Step 3 — Vercel Account
vercel.com pe jao
"Sign up with GitHub" karo (free)

## Step 4 — Import Project
Vercel dashboard → "Add New Project"
GitHub repo select karo → Import

## Step 5 — Environment Variable (IMPORTANT)
Deploy se pehle:
Settings → Environment Variables
Name:  HF_API_TOKEN
Value: hf_tumhara_token_yahan
Save karo

## Step 6 — Deploy
"Deploy" button dabao
2 minute mein live ho jayega!

## File Structure
voicegen/
  vercel.json
  package.json
  api/
    generate.js
  public/
    index.html
