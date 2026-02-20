# Nova Accounting App

A comprehensive full-stack accounting application for managing sales records, chart of accounts, items, employees, and financial data with user authentication, role-based access control, and a comprehensive dashboard.

**Deployment:** Server on Heroku | Client on Netlify

## Features

### Core Features
- **User Authentication**: Secure login system with JWT tokens
- **Role-Based Access**: Admin and Employee roles with different permissions
- **Sales Records**: Create, view, edit, and delete daily sales records with QR, cash, and rider payment tracking
- **Dashboard**: Visual analytics with charts and statistics
- **User Management**: Admin can create and manage user accounts

### Accounting Features
- **Chart of Accounts**: Complete chart of accounts management with categories (Asset, Liability, Equity, Income, Expense)
- **Automatic Account Codes**: Auto-generated unique account codes based on category (e.g., Asset=1001, Expense=6001)
- **Subcategories**: Custom subcategory management with system-protected defaults
- **Opening Balances**: Track opening balances for all accounts

### Inventory & Items
- **Items Management**: Full CRUD operations for inventory items
- **Item Groups**: Organize items into custom groups
- **Units Management**: Define and manage measurement units (kg, L, pcs, etc.)
- **Unit Pricing**: Track unit prices for items

### Employee Management
- **Employee Records**: Comprehensive employee information management
- **Automatic Account Creation**: Automatically creates expense accounts for new employees
- **Document Management**: Upload and store employee ID documents
- **Position Management**: Define and manage employee positions

### Additional Features
- **Transportation Tracking**: Track transportation recipients and payments
- **Sales Analytics**: Detailed sales reports and analytics
- **Database**: SQLite database for data storage

## Tech Stack

### Backend
- Node.js with Express
- SQLite3 database
- JWT authentication
- bcryptjs for password hashing

### Frontend
- React 18
- React Router for navigation
- Axios for API calls
- Recharts for data visualization
- Modern CSS with responsive design

## Project Structure

This project is structured for separate deployments:
- **Server** (`/server`) → Deploy to Heroku
- **Client** (`/client`) → Deploy to Netlify

## Installation (Local Development)

1. **Install server dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Install client dependencies:**
   ```bash
   cd ../client
   npm install
   ```

3. **Set up server environment variables:**
   ```bash
   cd ../server
   cp .env.example .env
   ```
   Edit `server/.env` and set your `JWT_SECRET`.

4. **Start the application:**
   ```bash
   # Terminal 1 - Start server
   cd server
   npm start

   # Terminal 2 - Start client
   cd client
   npm start
   ```

## Deployment

**For production deployment, see:**
- `DEPLOYMENT_GUIDE.md` - Complete deployment instructions
- `README_DEPLOYMENT.md` - Quick reference

## Default Login

- **Username:** `admin`
- **Password:** `admin123`

**Important:** Change the default admin password after first login in production!

## API Endpoints

### Root & Health
- `GET /` - API information and available endpoints
- `GET /api/health` - Health check and database connection status

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/register` - Register new user (admin only)
- `GET /api/auth/users` - Get all users (admin only)
- `GET /api/auth/transportation-recipients` - Get transportation recipients

### Sales Records
- `GET /api/sales` - Get all sales records
- `GET /api/sales/:id` - Get sales record by ID
- `POST /api/sales` - Create new sales record
- `PUT /api/sales/:id` - Update sales record
- `DELETE /api/sales/:id` - Delete sales record

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Employees
- `GET /api/employees` - Get all employees
- `GET /api/employees/:id` - Get employee by ID
- `POST /api/employees` - Create new employee (admin only)
- `PUT /api/employees/:id` - Update employee (admin only)
- `DELETE /api/employees/:id` - Delete employee (admin only)
- `GET /api/employees/transportation/recipients` - Get transportation recipients

### Positions
- `GET /api/positions` - Get all positions
- `GET /api/positions/:id` - Get position by ID
- `POST /api/positions` - Create new position (admin only)
- `PUT /api/positions/:id` - Update position (admin only)
- `DELETE /api/positions/:id` - Delete position (admin only)

### Chart of Accounts
- `GET /api/chart-of-accounts` - Get all accounts
- `GET /api/chart-of-accounts/:id` - Get account by ID
- `POST /api/chart-of-accounts` - Create new account (admin only, auto-generates account code)
- `PUT /api/chart-of-accounts/:id` - Update account (admin only)
- `DELETE /api/chart-of-accounts/:id` - Delete account (admin only)

### Subcategories
- `GET /api/subcategories` - Get all subcategories
- `GET /api/subcategories/:id` - Get subcategory by ID
- `POST /api/subcategories` - Create new subcategory (admin only)
- `PUT /api/subcategories/:id` - Update subcategory (admin only)
- `DELETE /api/subcategories/:id` - Delete subcategory (admin only, system subcategories protected)

### Items
- `GET /api/items` - Get all items
- `GET /api/items/:id` - Get item by ID
- `POST /api/items` - Create new item (admin only)
- `PUT /api/items/:id` - Update item (admin only)
- `DELETE /api/items/:id` - Delete item (admin only)

### Item Groups
- `GET /api/groups` - Get all item groups
- `GET /api/groups/:id` - Get group by ID
- `POST /api/groups` - Create new group (admin only)
- `PUT /api/groups/:id` - Update group (admin only)
- `DELETE /api/groups/:id` - Delete group (admin only)

### Units
- `GET /api/units` - Get all units
- `GET /api/units/:id` - Get unit by ID
- `POST /api/units` - Create new unit (admin only)
- `PUT /api/units/:id` - Update unit (admin only)
- `DELETE /api/units/:id` - Delete unit (admin only)

## Project Structure

```
nova-accounting/
├── server/
│   ├── database/
│   │   ├── init.js          # Database initialization
│   │   └── nova_accounting.db  # SQLite database
│   ├── middleware/
│   │   └── auth.js          # Authentication middleware
│   ├── routes/
│   │   ├── auth.js          # Authentication routes
│   │   ├── sales.js         # Sales records routes
│   │   ├── dashboard.js     # Dashboard routes
│   │   ├── employees.js     # Employee management routes
│   │   ├── positions.js     # Position management routes
│   │   ├── chartOfAccounts.js  # Chart of accounts routes
│   │   ├── subcategories.js   # Subcategory management routes
│   │   ├── items.js         # Items management routes
│   │   ├── groups.js        # Item groups routes
│   │   └── units.js         # Units management routes
│   ├── uploads/            # File uploads (employee documents)
│   ├── index.js            # Server entry point
│   ├── package.json
│   └── Procfile            # Heroku process file
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/      # React components (Layout, PrivateRoute)
│   │   ├── context/         # React context (AuthContext)
│   │   ├── pages/           # Page components
│   │   │   ├── Dashboard.js
│   │   │   ├── SalesEntry.js
│   │   │   ├── SalesList.js
│   │   │   ├── Employees.js
│   │   │   ├── Positions.js
│   │   │   ├── Users.js
│   │   │   ├── ChartOfAccounts.js
│   │   │   └── Item.js
│   │   ├── utils/           # Utility functions
│   │   ├── App.js
│   │   └── index.js
│   ├── build/              # Production build
│   ├── package.json
│   └── netlify.toml        # Netlify configuration
├── package.json
└── README.md
```

## Usage

### Getting Started
1. **Login**: Use the default admin credentials (`admin` / `admin123`) or create a new user account (admin only).

2. **Dashboard**: 
   - View total sales, today's sales, monthly sales
   - See charts for sales trends, categories, and payment methods

### Sales Management
3. **Create Sales Records**: 
   - Navigate to "Sales Records" → "New Sales Record"
   - Fill in date, amount, QR sales, cash sales, rider payments
   - Add optional fields (description, category, payment method)
   - Click "Create"

4. **View Sales List**: 
   - Navigate to "Sales Records" → "Sales List"
   - View, edit, or delete existing sales records

### Accounting Management (Admin only)
5. **Chart of Accounts**:
   - Navigate to "Accounting" → "Administration" → "Chart of Accounts"
   - Add accounts under categories: Asset, Liability, Equity, Income, Expense
   - Account codes are automatically generated (e.g., Asset=1001, Expense=6001)
   - Manage subcategories for each category
   - System subcategories (Cost of Goods Sold, Salary, Marketing, Utilities) cannot be deleted

6. **Items Management**:
   - Navigate to "Accounting" → "Administration" → "Item"
   - Add items with name, description, unit price, item group, and unit
   - Manage custom item groups
   - Manage measurement units (kg, L, pcs, etc.)

### Employee Management (Admin only)
7. **Employees**:
   - Navigate to "Employees" → "Add Employee"
   - Add comprehensive employee information
   - Upload employee ID documents
   - Automatically creates expense account for each employee

8. **Positions**:
   - Navigate to "Positions" → "Add Position"
   - Define and manage employee positions

### User Management (Admin only)
9. **Users**:
   - Navigate to "Users" → "Add New User"
   - Create employee or admin accounts
   - Manage user roles and permissions

## Database

The application uses SQLite, which creates a database file at `server/database/nova_accounting.db` automatically on first run.

### Database Tables
- `users`: User accounts with authentication and roles
- `sales_records`: Daily sales records with QR, cash, and rider payment tracking
- `employees`: Employee information and documents
- `positions`: Employee position definitions
- `chart_of_accounts`: Chart of accounts with categories, subcategories, and opening balances
- `subcategories`: Account subcategories (with system-protected defaults)
- `items`: Inventory items with pricing and grouping
- `item_groups`: Custom item groups for organizing items
- `units`: Measurement units (kg, L, pcs, etc.)

### Account Code System
- **Asset**: Prefix `1` (e.g., 1001, 1002, 1003...)
- **Liability**: Prefix `2` (e.g., 2001, 2002, 2003...)
- **Equity**: Prefix `3` (e.g., 3001, 3002, 3003...)
- **Income**: Prefix `4` (e.g., 4001, 4002, 4003...)
- **Expense**: Prefix `6` (e.g., 6001, 6002, 6003...)

Account codes are automatically generated and unique per category.

## Production Deployment

1. Set `NODE_ENV=production` in your `.env` file
2. Use a strong `JWT_SECRET` (generate with: `openssl rand -base64 32`)
3. Build the React app: `cd client && npm run build`
4. The server will serve the built React app automatically
5. Consider migrating to PostgreSQL for production use
6. Set up proper SSL/HTTPS
7. Configure proper CORS settings

## Security Notes

- Change default admin password immediately
- Use strong JWT secrets in production
- Consider rate limiting for API endpoints
- Implement input validation and sanitization
- Use HTTPS in production
- Regularly backup the database

## License

ISC

## Support

For issues or questions, please check the code comments or create an issue in the repository.
