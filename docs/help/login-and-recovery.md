# Login and recovery

## Log in

Use your **UserID** and password. You do not log in with your contact email.

**Local developers:** after `npm run serve`, run `npm run seed:emulator` if login fails with “user not found” (emulator Auth resets when emulators stop). Sign in at **http://127.0.0.1:5180/login.html**.

## Forgot password

Enter your UserID on the forgot-password page. A reset link is sent to your **contact email**.

## Forgot UserID

Enter your contact email. If accounts exist, you receive an email listing all UserIDs for that address (no passwords).
