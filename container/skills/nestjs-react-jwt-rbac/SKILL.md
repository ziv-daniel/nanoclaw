---
name: nestjs-react-jwt-rbac
description: |
  Complete authentication infrastructure pattern for NestJS backend + React frontend
  with JWT tokens and role-based authorization (RBAC). Use when: (1) building auth
  system for NestJS + React stack, (2) need role-based access control with guards,
  (3) multiple user roles with different permissions, (4) JWT token-based
  authentication with 7-day expiry, (5) session persistence across browser restarts.
  Covers auth module (service, controller, JWT strategy), guards (JWT + Roles),
  decorators (@Roles, @Public), frontend auth context with localStorage, API client
  interceptors, and role-based routing.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# NestJS + React JWT Authentication with Role-Based Authorization

## Problem

Building a secure full-stack application with NestJS backend and React frontend requires:

- User authentication (who is the user?)
- Session management (stay logged in across browser restarts)
- Authorization (what can this user access?)
- Role-based access control (different permissions for different roles)
- Protected routes (redirect unauthenticated users to login)
- API security (attach JWT token to requests, handle 401 errors)

Without proper infrastructure, teams face:
- Inconsistent auth patterns across controllers
- Manual role checking in every route
- No centralized session management
- Lost sessions on browser refresh
- Duplicate auth logic in frontend and backend

## Context / Trigger Conditions

**Use this pattern when:**

1. **Stack:**
   - NestJS backend (with Passport.js)
   - React frontend
   - JWT token-based authentication
   - PostgreSQL or similar database

2. **Requirements:**
   - Multiple user roles (e.g., Admin, Manager, User)
   - Role-based authorization (some routes only for specific roles)
   - Session persistence (user stays logged in)
   - Protected routes (redirect to login if not authenticated)
   - Secure API (JWT token attached to all requests)

3. **User Roles:**
   - 2+ distinct roles with different permissions
   - Some routes accessible by all authenticated users
   - Some routes restricted to specific roles

## Solution

### Backend Implementation (NestJS)

#### Step 1: Install Dependencies

```bash
bun add @nestjs/jwt @nestjs/passport passport passport-jwt
bun add -d @types/passport-jwt
```

#### Step 2: Create Auth Module Structure

```
apps/api/src/modules/auth/
├── auth.module.ts          # Module definition
├── auth.controller.ts      # Login endpoint
├── auth.service.ts         # Business logic
├── jwt.strategy.ts         # JWT validation
└── guards/
    ├── jwt-auth.guard.ts   # Protect routes
    └── roles.guard.ts      # Role-based access
```

#### Step 3: Define User Role Enum

**File:** `apps/api/src/types/user-role.enum.ts`

```typescript
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SITE_COMMANDER = 'SITE_COMMANDER',
  MANAGER = 'MANAGER',
  USER = 'USER',
}
```

#### Step 4: Create Auth Service

**File:** `apps/api/src/modules/auth/auth.service.ts`

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { db } from '../../database/drizzle';
import { users } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { UserRole } from '../../types/user-role.enum';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(identifier: string) {
    // Validate user (e.g., by ID number, email, etc.)
    const user = await db
      .select()
      .from(users)
      .where(eq(users.idNumber, identifier))
      .limit(1);

    if (!user || user.length === 0) {
      throw new NotFoundException('User not found');
    }

    const foundUser = user[0];

    // Determine role from user flags
    const role = this.determineUserRole(foundUser);

    // Generate JWT token
    const payload = {
      sub: foundUser.id,
      idNumber: foundUser.idNumber,
      fullName: foundUser.fullName,
      role,
      siteId: foundUser.siteId,
      branchId: foundUser.branchId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: foundUser.id,
        idNumber: foundUser.idNumber,
        fullName: foundUser.fullName,
        role,
        siteId: foundUser.siteId,
        branchId: foundUser.branchId,
      },
    };
  }

  private determineUserRole(user: any): UserRole {
    if (user.isSuperAdmin) return UserRole.SUPER_ADMIN;
    if (user.isSiteCommander) return UserRole.SITE_COMMANDER;
    if (user.isManager) return UserRole.MANAGER;
    return UserRole.USER;
  }

  async validateUser(userId: number) {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.length === 0) {
      return null;
    }

    return user[0];
  }
}
```

#### Step 5: Create Auth Controller

**File:** `apps/api/src/modules/auth/auth.controller.ts`

```typescript
import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../../decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: { idNumber: string }) {
    return this.authService.login(body.idNumber);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@Request() req) {
    return req.user;
  }
}
```

#### Step 6: Create JWT Strategy

**File:** `apps/api/src/modules/auth/jwt.strategy.ts`

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    // Payload is already validated by passport-jwt
    // This method just needs to return the user object
    return {
      userId: payload.sub,
      idNumber: payload.idNumber,
      fullName: payload.fullName,
      role: payload.role,
      siteId: payload.siteId,
      branchId: payload.branchId,
    };
  }
}
```

#### Step 7: Create JWT Auth Guard

**File:** `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
```

#### Step 8: Create Roles Guard

**File:** `apps/api/src/modules/auth/guards/roles.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../decorators/roles.decorator';
import { UserRole } from '../../../types/user-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // No roles required, allow access
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('No user found in request');
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `User with role ${user.role} does not have access to this resource`
      );
    }

    return true;
  }
}
```

#### Step 9: Create Decorators

**File:** `apps/api/src/decorators/public.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

**File:** `apps/api/src/decorators/roles.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../types/user-role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

#### Step 10: Configure Auth Module

**File:** `apps/api/src/modules/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
```

#### Step 11: Apply Guards Globally

**File:** `apps/api/src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [AuthModule, /* other modules */],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Apply JWT guard globally
    },
  ],
})
export class AppModule {}
```

#### Step 12: Use Guards in Controllers

```typescript
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { Public } from '../../decorators/public.decorator';
import { UserRole } from '../../types/user-role.enum';

@Controller('resources')
export class ResourcesController {
  // Public route (no authentication required)
  @Public()
  @Get('public')
  getPublicResources() {
    return { message: 'Public data' };
  }

  // Protected route (any authenticated user)
  @Get('protected')
  getProtectedResources() {
    return { message: 'Protected data' };
  }

  // Role-restricted route (only SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Get('admin')
  getAdminResources() {
    return { message: 'Admin-only data' };
  }

  // Multiple roles allowed
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  @Get('management')
  getManagementResources() {
    return { message: 'Management data' };
  }
}
```

### Frontend Implementation (React)

#### Step 1: Create Auth Context

**File:** `apps/web/src/contexts/AuthContext.tsx`

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loginApi } from '../api/auth';

interface User {
  id: number;
  idNumber: string;
  fullName: string;
  role: string;
  siteId?: number;
  branchId?: number;
}

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (idNumber: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    if (token && storedUser) {
      setAccessToken(token);
      setUser(JSON.parse(storedUser));
    }

    setIsLoading(false);
  }, []);

  const login = async (idNumber: string) => {
    const response = await loginApi(idNumber);
    setAccessToken(response.accessToken);
    setUser(response.user);
    localStorage.setItem('auth_token', response.accessToken);
    localStorage.setItem('auth_user', JSON.stringify(response.user));
  };

  const logout = () => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

#### Step 2: Create API Client with Interceptor

**File:** `apps/web/src/api/client.ts`

```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth and redirect to login
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

#### Step 3: Create Auth Guard

**File:** `apps/web/src/guards/AuthGuard.tsx`

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const AuthGuard = ({ children, allowedRoles }: AuthGuardProps) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
```

#### Step 4: Setup Routes with Auth Guard

**File:** `apps/web/src/App.tsx`

```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AuthGuard } from './guards/AuthGuard';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { UserRole } from './types/user-role.enum';

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes (any authenticated user) */}
      <Route
        path="/dashboard"
        element={
          <AuthGuard>
            <DashboardPage />
          </AuthGuard>
        }
      />

      {/* Role-restricted routes */}
      <Route
        path="/admin"
        element={
          <AuthGuard allowedRoles={[UserRole.SUPER_ADMIN]}>
            <AdminPage />
          </AuthGuard>
        }
      />

      {/* Default redirect */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

export default App;
```

## Verification

### Backend Tests

1. **Login endpoint:**
```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"idNumber":"123456789"}'

# Should return:
# { "accessToken": "jwt-token-here", "user": {...} }
```

2. **Protected endpoint without token:**
```bash
curl http://localhost:3333/api/resources/protected

# Should return: 401 Unauthorized
```

3. **Protected endpoint with token:**
```bash
curl http://localhost:3333/api/resources/protected \
  -H "Authorization: Bearer <token>"

# Should return: 200 OK with data
```

4. **Role-restricted endpoint:**
```bash
# Admin token
curl http://localhost:3333/api/resources/admin \
  -H "Authorization: Bearer <admin-token>"

# Should return: 200 OK

# User token
curl http://localhost:3333/api/resources/admin \
  -H "Authorization: Bearer <user-token>"

# Should return: 403 Forbidden
```

### Frontend Tests

1. **Login flow:**
   - Open browser to `/login`
   - Enter credentials and submit
   - Should redirect to dashboard
   - Token should be in localStorage

2. **Protected route:**
   - While logged out, navigate to `/dashboard`
   - Should redirect to `/login`

3. **Role-based routing:**
   - Login as non-admin user
   - Navigate to `/admin`
   - Should redirect to `/unauthorized` or `/dashboard`

4. **Session persistence:**
   - Login
   - Refresh page
   - Should remain logged in

5. **Logout:**
   - Click logout button
   - Should redirect to `/login`
   - Token should be removed from localStorage

## Example

**Complete flow:**

1. User opens app → redirected to `/login`
2. User enters ID number → calls `POST /api/auth/login`
3. Backend validates user → generates JWT token
4. Frontend stores token in localStorage
5. Frontend redirects to role-specific dashboard
6. User navigates to protected page → API client attaches JWT token
7. Backend validates token → returns data
8. User refreshes page → session restored from localStorage
9. User clicks logout → token cleared, redirected to login

## Notes

### Security Best Practices (2026)

1. **JWT Secret:**
   - Use strong secret (32+ characters)
   - Store in environment variable
   - Rotate periodically

2. **Token Expiry:**
   - 7 days is reasonable for internal apps
   - 15-30 minutes for high-security apps
   - Implement refresh tokens for long-lived sessions

3. **Token Storage:**
   - localStorage is acceptable for internal apps
   - For high-security apps, consider httpOnly cookies
   - Never store tokens in sessionStorage (lost on tab close)

4. **Authorization:**
   - Principle of Least Privilege: assign minimum necessary roles
   - Log all unauthorized access attempts
   - Periodically review role assignments

5. **Centralized Role Management:**
   - Keep roles in one place (enum or DB table)
   - Avoid scattering role checks across code
   - Use guards and decorators consistently

### Performance Considerations

- JWT validation happens on every request (acceptable overhead <1ms)
- localStorage access is synchronous and fast
- Auth context causes minimal re-renders (user state rarely changes)

### Common Pitfalls

1. **Forgetting @Public() decorator:**
   - If JWT guard is global, public routes need @Public()
   - Login endpoint must be marked @Public()

2. **Not refreshing user state:**
   - When user updates profile, refresh user in context
   - Consider auto-refresh on focus

3. **Hardcoding role checks:**
   - Use @Roles() decorator instead of manual checks
   - Keeps authorization logic centralized

4. **Not handling expired tokens:**
   - Interceptor should catch 401 and redirect to login
   - Clear stale tokens from localStorage

## References

- [NestJS Authentication Documentation](https://docs.nestjs.com/security/authentication)
- [NestJS Role-Based Access Control Guide](https://www.permit.io/blog/how-to-protect-a-url-inside-a-nestjs-app-using-rbac-authorization)
- [Role-Based Authorization with JWT in NestJS](https://shpota.com/2022/07/16/role-based-authorization-with-jwt-using-nestjs.html)
- [Full-Stack TypeScript: React + NestJS + JWT](https://medium.com/att-israel/authentication-authorization-using-react-nestjs-jwt-token-55f52070a3f2)
- [Auth0: NestJS Role-Based Access Control](https://developer.auth0.com/resources/code-samples/api/nestjs/basic-role-based-access-control)
- [NestJS RBAC Best Practices (2026)](https://medium.com/@dev.muhammet.ozen/role-based-access-control-in-nestjs-15c15090e47d)
- [Passport.js Documentation](http://www.passportjs.org/packages/passport-jwt/)
