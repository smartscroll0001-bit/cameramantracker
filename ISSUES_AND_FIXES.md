# Issues Found and Fixes Implemented

## 1. Component Logic Bug: `KPIBadge`

### Issue
The `KPIBadge` component had a logic error where undefined or null `hours` resulted in an "Overperforming" status.
This happened because the logic was:
```javascript
if (hours < 7) { ... }
else if (hours <= 7.5) { ... }
else { return Overperforming }
```
If `hours` is `undefined`, `undefined < 7` is false, and `undefined <= 7.5` is false, so it fell through to the `else` block.

### Fix
I modified the component to treat `undefined` or `null` hours as `0`.
```javascript
const numericHours = Number(hours) || 0;
if (numericHours < 7) { ... }
```
This ensures that missing data is treated as "Underperforming" (or 0 hours), which is safer than "Overperforming".

### Tests
I added a unit test suite `src/components/KPIBadge.test.jsx` covering all scenarios:
- Hours < 7 (Underperforming)
- Hours = 7 (Normal)
- Hours = 7.5 (Normal)
- Hours > 7.5 (Overperforming)
- Status Override (On Leave, etc.)
- Undefined Hours (Now correctly returns Underperforming)

## 2. Security Vulnerabilities (Critical)

During the review, I identified critical security issues in the API implementation (`api/`).

### IDOR (Insecure Direct Object Reference)
The API endpoints lack server-side session verification. They rely entirely on the client providing the `userId`.
- **`api/auth.js`**: The `change-password` action takes `userId` from the request body and updates the password without verifying if the requester is that user.
- **`api/tasks.js`**: The `delete` action checks if `userId` matches the task owner, but trusts the `userId` provided in the request body.
- **`api/users.js`**: Likely similar issues (admin actions rely on `adminId` passed in body without verification).

### Lack of Authentication Middleware
There is no mechanism (like JWT or session cookies) to verify the identity of the user making the request. The `AuthContext` on the frontend manages state, but the backend API is stateless and unprotected.

### Recommendation
1. Implement a proper authentication mechanism (e.g., JWT or server-side sessions).
2. Create middleware to verify the token/session on every API request.
3. Replace `userId` in request bodies with the `userId` derived from the verified session/token.
