# PMC Leela Safety & Privacy

**Last reviewed: 10 October 2026**

PMC Leela is designed to help MANIT students meet and share campus life more safely. This document explains the protections in the current app and, just as importantly, their limits. It is not a promise of complete anonymity or a substitute for careful online behavior.

## Is PMC chat completely anonymous?

**No—not from PMC Leela or the service operator.** Students verify an account using a MANIT student email. The service keeps account information and can associate an account with its PMC chat name. Reports are also linked to the reporting and reported accounts so the safety limits can be enforced.

**PMC chat is pseudonymous to the other student.** In the current chat interface, a partner sees your chosen PMC chat name, gender, and academic year—not your registered email address or scholar number. The app does not send the partner's internal account ID in its match notification. A chat partner can still recognize you from what you choose to share, and you can reveal your identity yourself.

This distinction matters: “anonymous chat” describes what is shown to the other participant in the chat interface. It does not mean that your account is unverified, that the service cannot associate your account with activity, or that anything you send is impossible to copy.

## How PMC chat messages are handled

- Chat text and images are relayed live between the two connected students. The current app backend does not write them to a persistent chat-history database.
- When a chat ends, a student moves to the next chat, or a connection is lost, the backend removes the active room state from its running memory.
- The app does not provide an administrator dashboard for browsing past PMC chat transcripts. The service does retain account and report records needed for account operation and safety enforcement.
- This is **not end-to-end encryption**: the backend relays messages and processes them while they are being delivered. Do not send passwords, financial details, intimate images, or other information that would put you at risk if copied.
- A participant may copy, photograph, record, or otherwise preserve what they see. Clearing an active chat on the app server cannot erase a copy made on another person's device. Operational systems may also process connection metadata; no claim is made that all infrastructure logs or backups are instantly erased when a chat ends.

## Safety measures in the current app

- **Student verification:** registration is restricted to the configured MANIT student-email verification flow. Email and scholar-number details are account information, not chat display names.
- **Separate display names:** PMC chat names and Leela usernames are separate. This reduces casual cross-linking in the interface, but the service can associate both names with the same account.
- **Report and chat restriction:** a female student can report one account from PMC chat in a rolling 24-hour period. A report blocks the reported account from PMC chat for 48 hours; it does not block all other app features. Report records are linked to account IDs for enforcement. Do not use reports to harass or retaliate.
- **Reel reporting and moderation:** students can report reels for moderator review. Reels, captions, comments, and the Leela username are not anonymous in the way PMC chat is; the feed and shared reel links may be viewable outside a signed-in chat session. Post only media you are comfortable sharing.
- **Account deletion request:** a request can be made from **Me → Settings**. An administrator may resolve it sooner; unresolved requests are scheduled for deletion after 24 hours. Some identity information is retained to enforce the account's original gender restriction, and this process is not a guarantee that third-party records or backups are immediately erased.
- **Transport and sign-in:** authenticated write actions and chat connections require a signed-in student session. Use the official app and HTTPS service address. HTTPS/WSS protects data in transit when correctly configured, but does not make chat end-to-end encrypted or protect a recipient's device.

## Screenshot and recording limits

On Android, PMC Leela uses the operating system's secure-window setting to block ordinary screenshots and screen recordings while protected app screens are open. **This is a deterrent, not a guarantee:** it cannot stop someone from using a second phone, camera, or another external recording method.

iOS does not provide a reliable API for an app to prevent screenshots. PMC Leela therefore cannot promise screenshot prevention on iPhone. Treat anything displayed to another person as something that person may be able to preserve.

## What we ask students to do

- Keep conversations respectful. Do not pressure someone to disclose their identity, contact details, location, or private images.
- Stop a conversation and use the in-app report option if you experience harassment or feel unsafe.
- Do not share another student's messages, images, or identifying information without their permission.
- Remember that a pseudonym is not a promise that nobody can recognize you from context.
- For reels, captions, and comments, assume your content can be seen and saved by people beyond your intended audience.

## Data and transparency

PMC Leela must keep enough account and report information to verify accounts, operate the app, respond to reports, and enforce restrictions. Access to account information is distinct from access to chat transcripts: the current app does not provide an archive of PMC chat messages to moderators. Reports and account records are persistent application data, unlike live chat content.

The service's hosting, database, storage, email, and notification providers may process data needed to deliver their respective functions. Their own security, logging, and retention practices also apply. The app does not currently publish a complete provider-by-provider retention schedule for operational logs, backups, or safety reports. Do not interpret the temporary nature of an active chat as a promise that every related technical record is immediately erased.

We will update this document if the app's privacy behavior or safety controls change. If a statement here does not match the behavior of the version you are using, rely on the more cautious assumption and avoid sharing sensitive information.
