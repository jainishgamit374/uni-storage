# Testing Strategy

## Objective

Ensure the application is:
- Correct
- Secure
- Reliable
- Maintainable
- Regression-safe

## Testing Levels

1. Unit Testing
2. Integration Testing
3. API Testing
4. Component Testing
5. End-to-End Testing
6. Security Testing
7. Performance Testing

---

## 2. Unit Tests

Test individual functions/services in isolation.

For example:

```text
calculateTotal()
validateEmail()
generateToken()
checkUserPermission()
```

Unit tests must cover:

- Normal input
- Invalid input
- Empty input
- Boundary values
- Expected errors
- Important edge cases

Example:

```text
calculateTotal(100, 2)
→ 200

calculateTotal(0, 2)
→ 0

calculateTotal(-10, 2)
→ validation error
```

---

## 3. Backend/API Testing

This is extremely important in MERN.

For every API, define what needs to be tested.

Example:

```text
POST /api/v1/auth/login
```

### Test cases

```text
✓ Valid credentials → 200
✓ Wrong password → 401
✓ Unknown email → 401
✓ Missing email → 400
✓ Missing password → 400
✓ Invalid email format → 400
✓ Disabled account → 403
✓ Malformed request → 400
✓ Server failure → 500
```

You can maintain a table:

| Test              | Expected |
| ----------------- | -------- |
| Valid request     | 200      |
| Invalid input     | 400      |
| Unauthenticated   | 401      |
| Unauthorized role | 403      |
| Resource missing  | 404      |
| Server failure    | 500      |

---

## 4. Authentication Testing

For authentication, don't test only:

> Login works.

Test the entire security flow.

```text
Register
 ↓
Email verification
 ↓
Login
 ↓
Access protected API
 ↓
Refresh/authentication renewal
 ↓
Logout
 ↓
Try protected API again
```

Test:

* Valid login
* Invalid password
* Expired authentication
* Missing authentication
* Invalid authentication
* Logout
* Disabled user
* Password reset
* Password change

---

## 5. Authorization Testing

This is different from authentication.

Authentication:

> **Who are you?**

Authorization:

> **What are you allowed to do?**

Example:

```text
Admin
Manager
User
```

Test:

```text
Admin → delete user → allowed

Manager → delete user → denied

User → delete user → denied

Guest → access admin API → denied
```

This is a very important security test.

---

## 6. Database Testing

Test:

* Required fields
* Unique fields
* Invalid data
* Relationships
* Indexes
* Duplicate records
* Missing records
* Database errors

Example:

```text
Create user with existing email
        ↓
Should fail
        ↓
DUPLICATE_EMAIL
```

---

## 7. Frontend Testing

For each page/component, test:

### Loading

```text
API request
 ↓
Loading UI
```

### Success

```text
API success
 ↓
Correct data displayed
```

### Error

```text
API failure
 ↓
Error message displayed
```

### Empty

```text
No data
 ↓
Empty state displayed
```

### Interaction

```text
Click button
 ↓
Expected action occurs
```

---

## 8. Form Testing

Every important form should test:

```text
Empty fields
Invalid email
Invalid password
Too-short input
Too-long input
Special characters
Valid input
Duplicate value
Server validation error
```

For example:

```text
Registration Form

[ ] Empty name
[ ] Invalid email
[ ] Weak password
[ ] Password mismatch
[ ] Existing email
[ ] Valid registration
[ ] API failure
```

---

## 9. End-to-End Testing

This tests the **complete real user journey**.

For example:

```text
Open website
 ↓
Register
 ↓
Login
 ↓
Dashboard
 ↓
Create product
 ↓
View product
 ↓
Edit product
 ↓
Delete product
 ↓
Logout
```

Instead of testing individual pieces, E2E asks:

> **Does the entire application actually work from the user's perspective?**

---

## 10. Edge Cases

This is where AI can be very useful.

For every feature, ask:

```text
What can go wrong?

What happens if:
- User double-clicks?
- Network disappears?
- API takes 10 seconds?
- Database is unavailable?
- User sends unexpected data?
- Two requests happen simultaneously?
- Resource gets deleted while being viewed?
- User has no permissions?
```

These cases should become tests where appropriate.

---

## 11. Security Testing

Include:

```text
[ ] Authentication bypass
[ ] Authorization bypass
[ ] Input validation
[ ] NoSQL injection
[ ] XSS
[ ] Sensitive data exposure
[ ] Rate limiting
[ ] CORS configuration
[ ] File upload validation
[ ] Token/session security
```

Don't blindly ask AI to "make it secure."

Give it explicit security requirements.

---

## 12. Performance Testing

For important APIs/pages:

```text
Response time
Concurrent users
Database query performance
Large datasets
Pagination
Memory usage
```

For example:

```text
GET /api/v1/products

Test with:
10 products
1,000 products
100,000 products
```

Make sure the API isn't accidentally loading 100,000 records into memory.

---

## 13. Regression Testing

This is **very important when you're using AI.**

Suppose AI changes:

```text
User Service
```

You need to make sure it didn't break:

```text
Login
Profile
Orders
Admin
Notifications
```

So your testing document should say:

```md
Any change to existing functionality must run relevant
existing tests to prevent regression.
```

---

## 14. Acceptance Testing

This connects directly to your PRD.

For example, PRD says:

> User can create an account.

Testing verifies:

```text
[✓] User can submit registration
[✓] Invalid email rejected
[✓] Duplicate email rejected
[✓] Password validated
[✓] Account created
[✓] User receives expected response
[✓] User can subsequently log in
```

Therefore:

**PRD → Acceptance Criteria → Tests**

That's a very powerful connection.

---

## 15. Test Case Format

I recommend giving your AI agent a standard format:

```md
## TC-AUTH-001

### Test
Successful login

### Preconditions
User exists and account is active.

### Input
Valid email and password.

### Expected Result
HTTP 200.
Authentication state created.
User redirected to dashboard.

### Priority
High

### Type
Integration / E2E
```

Another:

```md
## TC-AUTH-002

### Test
Login with incorrect password

### Input
Valid email + incorrect password

### Expected Result
HTTP 401.
Standardized error returned.
No authenticated session created.

### Priority
High
```
