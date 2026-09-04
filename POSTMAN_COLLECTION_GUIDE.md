# HandyHub Postman Collection Guide

## 📦 Import Instructions

1. Open Postman
2. Click **Import** button (top left)
3. Select **HandyHub_Postman_Collection.json** file
4. Collection will be imported with all 40+ endpoints organized in 10 folders

---

## 🗂️ Collection Structure

The collection is organized exactly like your GearUp API:

### **01 - Authentication** (10 endpoints)
- Register User (Customer)
- Register User (Technician)
- Verify Email
- Login
- Google Login
- Get Current User
- Refresh Token
- Logout
- Forgot Password
- Reset Password

### **02 - User Profile** (1 endpoint)
- Upload Profile Image

### **03 - Appointments (Customer)** (5 endpoints)
- Book Appointment
- Pay for Existing Appointment
- Cancel Appointment
- Get My Appointments
- Get Single Appointment

### **04 - Appointments (Technician)** (2 endpoints)
- Get My Appointments (Technician)
- Update Appointment Status

### **05 - Appointments (Admin)** (1 endpoint)
- Get All Appointments

### **06 - Technician Application** (5 endpoints)
- Apply as Technician
- Verify Technician Email
- Approve Technician (Admin)
- Reject Technician (Admin)
- Get All Technicians (Admin)

### **07 - Schedules (Technician)** (6 endpoints)
- Create Schedule
- Get My Schedules
- Update Schedule
- Publish Schedule
- Get Schedule by ID
- Delete Schedule

### **08 - Schedules (Public & Admin)** (2 endpoints)
- Get Today's Available Schedules (Public)
- Get All Schedules (Admin)

### **09 - Analytics** (3 endpoints)
- Customer Analytics
- Technician Analytics
- Admin Analytics

### **10 - Admin** (5 endpoints)
- Get All Appointments
- Get All Technicians
- Get All Schedules
- Approve Technician
- Get System Analytics

---

## 🔧 Setup

### 1. Environment Variables

Create a Postman environment with these variables:

```
baseUrl = http://localhost:5000
accessToken = (will be auto-populated after login)
refreshToken = (will be auto-populated after login)
userId = (will be auto-populated)
appointmentId = (set manually or auto from responses)
scheduleId = (set manually or auto from responses)
techinicianId = (set manually or auto from responses)
```

### 2. Auto-Token Management

The collection includes **automatic token management**:
- Login/Register responses automatically save tokens to environment variables
- All authenticated requests use `{{accessToken}}` from environment
- No manual token copy-paste needed!

---

## 🚀 Quick Start Testing Flow

### **Step 1: Register & Login as Customer**
1. Use **"01 - Authentication → Register User (Customer)"**
2. Check email for OTP
3. Use **"01 - Authentication → Verify Email"** with OTP
4. Token automatically saved! ✅

### **Step 2: Upload Profile Image**
1. Use **"02 - User Profile → Upload Profile Image"**
2. Select an image file in the form-data

### **Step 3: Book an Appointment**
1. First, get available schedules:
   - Use **"08 - Schedules (Public & Admin) → Get Today's Available Schedules"**
   - Copy a `scheduleId` from response
2. Book appointment:
   - Use **"03 - Appointments (Customer) → Book Appointment"**
   - Paste `scheduleId` in request body
3. Follow bKash payment URL from response

### **Step 4: View Your Appointments**
1. Use **"03 - Appointments (Customer) → Get My Appointments"**
2. Filter by status: PENDING, CONFIRMED, ONGOING, COMPLETED, CANCELLED

---

## 🔐 Authentication Methods

The collection supports **both authentication methods**:

### Method 1: Bearer Token (Recommended for Postman)
```
Authorization: Bearer {{accessToken}}
```
✅ Already configured in the collection

### Method 2: Cookies
Tokens are also sent as HTTP-only cookies automatically

---

## 📝 Testing Different Roles

### **Customer Flow**
1. Register → Verify → Login
2. Browse schedules
3. Book appointments
4. View my appointments
5. Cancel appointments
6. View analytics

### **Technician Flow**
1. Apply as technician (with documents)
2. Verify email
3. Wait for admin approval
4. Login after approval
5. Create schedules
6. Publish schedules
7. View my appointments
8. Update appointment status
9. View analytics

### **Admin Flow**
1. Login with admin credentials
2. View all technician applications
3. Approve/Reject technicians
4. View all appointments
5. View all schedules
6. View system analytics

---

## 🎯 Request Features

### 1. **Pre-request Scripts**
- Automatically set headers
- Token validation

### 2. **Test Scripts**
- Auto-save tokens after login
- Auto-save IDs from responses
- Response validation

### 3. **Variables**
All requests use environment variables:
```
{{baseUrl}}
{{accessToken}}
{{appointmentId}}
{{scheduleId}}
```

### 4. **Query Parameters**
All list endpoints support:
- `page` - Pagination (default: 1)
- `limit` - Items per page (default: 10)
- `sortBy` - Sort field (default: createdAt)
- `sortOrder` - asc | desc (default: desc)
- `status` - Filter by status
- Various search/filter options

---

## 📤 File Upload Examples

### Profile Image
```
Key: profileImage
Type: File
Select: image.jpg
```

### Technician Application
```
Key: user[name]           | Type: Text  | Value: Dr. Smith
Key: user[email]          | Type: Text  | Value: smith@example.com
Key: user[password]       | Type: Text  | Value: SecurePass123!
Key: technician[specialization] | Type: Text | Value: Plumbing
Key: resume               | Type: File  | Select: resume.pdf
Key: additionalFiles      | Type: File  | Select: license.pdf
Key: additionalFiles      | Type: File  | Select: certificate.pdf
```

---

## 🔄 Token Refresh Flow

When access token expires:
1. Use **"01 - Authentication → Refresh Token"**
2. New tokens automatically saved
3. Continue making requests

---

## 🧪 Sample Test Data

### Customer Registration
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "SecurePass123!",
  "role": "CUSTOMER",
  "phone": "+1234567890"
}
```

### Technician Registration
```json
{
  "name": "Dr. Smith",
  "email": "smith@example.com",
  "password": "SecurePass123!",
  "role": "TECHNICIAN",
  "phone": "+1234567891"
}
```

### Create Schedule
```json
{
  "startDateTime": "2026-09-05T09:00:00Z",
  "endDateTime": "2026-09-05T15:00:00Z",
  "meetingLink": "https://meet.google.com/xyz-abc-def"
}
```

### Book Appointment
```json
{
  "scheduleId": "your-schedule-id-here"
}
```

---

## 💡 Pro Tips

### 1. **Use Environments**
Create separate environments for:
- Local Development
- Staging
- Production

### 2. **Use Collection Runner**
Run entire folders to test multiple endpoints:
1. Right-click on folder
2. Select "Run collection"
3. Watch automated tests run

### 3. **Export/Share**
Share the collection with your team:
1. Right-click collection
2. Select "Export"
3. Share JSON file

### 4. **Monitor API Health**
Use Postman Monitor to:
- Schedule automatic tests
- Get alerts on failures
- Track API performance

---

## 🐛 Troubleshooting

### Token Not Working
1. Check if token is in environment variables
2. Try refreshing token
3. Re-login if needed

### 401 Unauthorized
- Token expired → Use refresh token
- Invalid token → Re-login
- No token → Login first

### 403 Forbidden
- Wrong user role
- Check endpoint requirements
- Example: Customer trying to access technician endpoints

### 404 Not Found
- Check baseUrl is correct
- Verify API is running
- Check endpoint path

---

## 📊 Response Formats

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "name": "ValidationError",
  "message": "Invalid input data",
  "error": { ... }
}
```

---

## 🎉 You're Ready!

The collection is complete with:
- ✅ 40+ endpoints
- ✅ Organized in 10 folders
- ✅ Auto token management
- ✅ Pre-configured requests
- ✅ Environment variables
- ✅ Sample data
- ✅ Test scripts

**Happy Testing! 🚀**

---

## 📞 Support

For issues or questions:
1. Check API_DOCUMENTATION.md
2. Review BUGS_FIXED.md
3. Check ROUTE_VERIFICATION.md

**Last Updated**: September 4, 2026
