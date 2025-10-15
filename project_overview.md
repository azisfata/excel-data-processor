# Excel Data Processor - Project Overview

## **Project Overview**
This is a sophisticated React + TypeScript web application designed for the Indonesian Ministry of Cooperatives and SMEs (Kemenkop UKM) to process and analyze government budget realization data from Excel files.

## **Core Architecture & Tech Stack**

### **Frontend**
- **React 19.1.1** with TypeScript
- **Vite** as build tool
- **TailwindCSS** for styling
- **React Router** for navigation
- **React Dropzone** for file uploads

### **Backend & Services**
- **Express.js** servers (activity-upload-server.js, auth-server.js)
- **Supabase** as database and backend service
- **Google Gemini AI** (models/gemini-2.5-flash) for intelligent data analysis
- **XLSX** library for Excel processing

### **Key Dependencies**
- Authentication: JWT, bcryptjs
- File handling: Multer, cookie-parser
- AI integration: @google/genai

## **Main Features**

### **1. Excel Data Processing**
- **Smart parsing** of Indonesian government budget Excel files
- **Hierarchical code processing** with 7-level depth structure
- **Data cleaning and restructuring** to handle complex budget data
- **Column filtering and totals calculation**
- **Excel download** of processed data with proper formatting

### **2. Activity Management**
- **CRUD operations** for budget activities
- **Budget allocations** with real-time validation
- **File attachments** for supporting documents
- **Status tracking**: Rencana, Komitmen, Outstanding, Terbayar
- **Advanced filtering** by year, month, status, and search terms

### **3. AI Assistant**
- **Intelligent data analysis** using Google Gemini AI
- **Indonesian language support** for queries and responses
- **Context-aware responses** based on current budget data
- **Quick prompts** for common analytical questions
- **Real-time conversation** with data context

### **4. Authentication & Authorization**
- **Role-based access control**: Admin, User, Viewer
- **Email domain restriction** (@kemenkopmk.go.id only)
- **Protected routes** and secure API endpoints
- **JWT-based authentication** with refresh tokens

### **5. Data Visualization**
- **Budget realization tables** with hierarchical display
- **Real-time calculations** of totals and remaining budget
- **Activity status summaries** and progress tracking
- **Attachment management** with preview capabilities

## **Application Structure**

```
/excel-data-processor/
├── server/
│   ├── activity-upload-server.js  # File upload handling
│   └── auth-server.js             # Authentication server
├── services/
│   ├── excelProcessor.ts          # Core Excel processing logic
│   ├── aiService.ts               # Gemini AI integration
│   ├── supabaseService.ts         # Database operations
│   └── activityAttachmentService.ts # File attachment handling
├── src/
│   ├── components/ProtectedRoute.tsx
│   ├── contexts/AuthContext.tsx
│   ├── pages/ (Login, Signup, UserManagement)
│   └── utils/ (hierarchy.ts, supabase.ts)
└── bahanUpload/                   # Sample Excel files
```

## **Technical Implementation Deep Dive**

### **Backend Architecture**

#### **Authentication Server (Port 3002)**
- **JWT-based authentication** with 7-day token expiration
- **bcrypt password hashing** with salt rounds of 10
- **Cookie-based session management** with httpOnly and secure flags
- **Role-based access control** with three levels: admin, user, viewer
- **Email domain restriction** to @kemenkopmk.go.id only
- **Supabase integration** using service role key for server-side operations

#### **Activity Upload Server (Port 3001)**
- **Multer-based file upload** with dynamic directory creation per activity
- **UUID-based file naming** to prevent conflicts
- **JSON metadata storage** for attachment tracking
- **Legacy metadata migration** support for backward compatibility
- **Static file serving** for attachment downloads

### **Excel Processing Pipeline**

#### **Data Transformation Steps**
1. **Header Detection**: Finds "Program Dukungan Manajemen" as data start point
2. **Column Cleaning**: Removes empty columns and footer notes
3. **Hierarchical Code Building**: Constructs 7-level budget codes from fragmented data
4. **Data Restructuring**: Fills empty cells using neighboring values
5. **Account Code Filtering**: Keeps only rows with 6-digit account codes
6. **Budget Calculations**: Sums Pagu, Lock, and Realisasi amounts

#### **Hierarchical Code Processing**
```typescript
// 7-level structure: [Level1].[Level2].[Level3].[Level4].[Level5].[Level6].[AccountCode]
const MAX_TRACE_SIZE = 7;
// Processes codes like: "01.01.01.01.01.01.123456"
```

### **Database Schema (Supabase)**

#### **Core Tables**
- **users**: Email, password_hash, role, name, unit, timestamps
- **processed_results**: Excel data storage with metadata
- **activities**: Budget activity management
- **activity_attachments**: File attachment references

### **Frontend Implementation**

#### **State Management**
- **React Context** for authentication state
- **Complex state management** for Excel processing and activity management
- **Local storage integration** for user preferences and history

#### **File Upload Handling**
- **React Dropzone** for drag-and-drop file selection
- **Chunked file processing** for large Excel files
- **Real-time progress indication** during processing

#### **AI Integration Features**
- **Context-aware prompts** built from current budget data
- **Indonesian language processing** for government-specific terminology
- **Error handling** with fallback model support
- **Rate limiting** and timeout management

### **Security Measures**

#### **Authentication Security**
- **Domain validation** at multiple layers (frontend + backend)
- **Password strength requirements** (minimum 6 characters)
- **Session management** with secure cookie settings
- **Input sanitization** and validation

#### **File Upload Security**
- **File type validation** for Excel files only
- **Path traversal protection** in file serving
- **Metadata-based access control** for attachments
- **Directory isolation** per activity

#### **API Security**
- **CORS configuration** for cross-origin requests
- **Input validation** on all endpoints
- **Error message sanitization** to prevent information leakage
- **Rate limiting** considerations for AI requests

### **Configuration Management**

#### **Environment Variables**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
JWT_SECRET=your-secure-random-string
```

#### **Development vs Production**
- **Development**: Relaxed CORS, detailed error messages
- **Production**: Secure cookies, HTTPS enforcement, minified errors

### **Performance Optimizations**

#### **Data Processing**
- **Pagination** for large datasets (5, 10, 50, 100, all options)
- **Memoization** of expensive calculations (activeTotals, filtered data)
- **Lazy loading** of historical data
- **Preview limits** (100 rows) for performance

#### **Memory Management**
- **File streaming** for large uploads
- **Garbage collection** considerations for large Excel files
- **Browser memory limits** handling for data visualization

### **Error Handling & Resilience**

#### **Comprehensive Error Management**
- **Network failure recovery** for API calls
- **File processing error handling** with user-friendly messages
- **Authentication error management** with retry mechanisms
- **AI service fallbacks** with multiple model support

#### **Data Consistency**
- **Transaction-like operations** for activity management
- **Metadata synchronization** between file system and database
- **Cache invalidation** strategies for real-time updates

## **Key Processing Logic**

### **Excel Data Processing Pipeline**
1. **Initial cleaning** - Remove footers, find header rows
2. **Column restructuring** - Fill empty cells, handle hierarchical codes
3. **Data filtering** - Keep only rows with 6-digit account codes
4. **Totals calculation** - Sum budget columns (Pagu, Lock, Realisasi)
5. **Final formatting** - Prepare for download and display

### **AI Integration Features**
- **Data snapshot generation** with current budget status
- **Context-aware system prompts** in Indonesian
- **Error handling** with fallback model support
- **Rate limiting** and timeout management

## **Security Features**
- **Environment-based configuration** (.env files)
- **Input validation** and sanitization
- **SQL injection protection** via Supabase
- **File upload restrictions** and validation
- **CORS configuration** for cross-origin requests

This implementation represents a **production-ready, enterprise-grade application** specifically designed for Indonesian government budget management, with robust security, sophisticated data processing capabilities, and modern web development practices.
