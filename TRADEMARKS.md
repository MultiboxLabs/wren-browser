# Trademarks

"Wren", "Wren Browser" and "Multibox Labs", and Wren's logos and app icons, are trademarks of Avocado and Bear Limited, which trades as Multibox Labs. Wren Browser's source code is under the Mozilla Public License 2.0, which grants no right to use them, as section 2.3 of the licence says.

The logos and icons are the files in `branding/`. They aren't under the Mozilla Public License, and all rights in them are reserved. The fonts in `branding/dmg/fonts` aren't Wren's. They're under the SIL Open Font License.

## What you may do

- Build and run Wren Browser from this repository with its name and icons, to use it yourself, and to develop, test and contribute to it.
- Say truthfully that your software is based on Wren Browser, or works with it.

## What needs permission

Ask Multibox Labs in writing, at licensing@wrenbrowser.com, before you:

- distribute a build of Wren Browser, or of a changed version of it, under the name Wren or with its logos or icons;
- use a name, logo or icon so like Wren's that people could take your software for Wren, or for something Multibox Labs made.

## Distributing a fork

A fork that you distribute must have its own name and icons. Distributing one also needs a licence for Wren Runtime, as Wren Runtime's own licence says. Before you distribute a fork, change these:

- the name, and every file in `branding/`;
- `bundleId`, `displayName`, `copyright` and the Sparkle feed and key (`SUFeedURL`, `SUPublicEDKey`) in each `wren-app*.json`;
- the product name, company name, copyright and help address in `src/main/channel.rs`.
