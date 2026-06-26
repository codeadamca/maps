# Lake Lines Admin Console

A simple vanilla PHP admin console for viewing and managing Shopify webhook sessions.

## Features

- **Simple Login**: Single admin login with .env credentials
- **Dashboard**: View all sessions in a table with filtering and sorting
- **Session Details**: View complete session information including:
  - Session metadata (ID, status, order ID, email, pricing)
  - Latest webhook event
  - Line items from the order/cart
  - Design thumbnails
  - Raw JSON payload for debugging
- **W3.CSS Styling**: No custom CSS, uses W3.CSS for styling

## Pages

### `/login.php`
- Login form
- Uses credentials from `.env` (CONSOLE_EMAIL, CONSOLE_PASSWORD)
- Sets PHP session on successful login

### `/dashboard.php`
- Displays table of all sessions
- Shows: ID, Status, Order ID, Email, Total Price, Last Updated
- Click any row to view session details
- Status badges with color coding (session, created, paid, fulfilled, cancelled)

### `/session.php?id={id}`
- Full session details
- Latest webhook event information
- Line items table
- Design ID extraction
- Design thumbnails (fetched from API)
- Raw JSON payload preview

### `/logout.php`
- Destroys session
- Redirects to login

## Technology Stack

- **PHP**: Vanilla procedural PHP (no frameworks)
- **Database**: MySQLi
- **Styling**: W3.CSS only (no custom CSS)
- **Configuration**: .env file

## Setup

### 1. Database

The console reads from these tables:

```sql
CREATE TABLE sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shopify_order_id BIGINT NULL UNIQUE,
    cart_token VARCHAR(255) NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'session',
    currency VARCHAR(10) NULL,
    total_price DECIMAL(10,2) NULL,
    email VARCHAR(255) NULL,
    design_ids JSON NULL,
    shopify_payload JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE session_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL UNIQUE,
    topic VARCHAR(100) NOT NULL,
    shopify_order_id BIGINT NULL,
    cart_token VARCHAR(255) NULL,
    payload JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Environment Configuration

Create `.env` file with:

```
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=root
MYSQL_DATABASE=lakelines
CONSOLE_EMAIL=lakelinesco@gmail.com
CONSOLE_PASSWORD=l@k3l1n3s
```

### 3. Access

Navigate to: `http://localhost/`

## Helper Functions

The `config.php` file provides reusable helpers:

- `is_logged_in()` - Check if user is authenticated
- `require_login()` - Redirect to login if not authenticated
- `fetch_one($connect, $sql)` - Fetch single row
- `fetch_all($connect, $sql)` - Fetch multiple rows
- `escape_sql($connect, $str)` - Escape string for SQL
- `query($connect, $sql)` - Execute query

## File Structure

```
/
├── .env                    (credentials)
├── .env.sample            (example)
├── .htaccess              (server config)
├── config.php             (shared configuration)
├── index.php              (redirect to dashboard/login)
├── login.php              (login form)
├── logout.php             (logout handler)
├── dashboard.php          (sessions list)
└── session.php            (session detail view)
```

## Security Notes

- Credentials stored in `.env` (never commit to git)
- Simple PHP session-based authentication
- No CSRF protection (can be added if needed)
- No input sanitization beyond mysqli_real_escape_string
- For production, use HTTPS, add password hashing, implement CSRF tokens

## Design Thumbnails

The session detail page displays design thumbnails by calling:

```
https://api.lakelines.co/design/thumb/{design_id}?colour=ffffff&width=200&height=200
```

Design IDs are extracted from the `shopify_payload` by searching for properties with `name === "design_id"`.

## Notes

- All styling uses W3.CSS classes only (w3-container, w3-card, w3-button, etc.)
- No custom CSS file is used
- Procedural PHP style (no classes or OOP)
- MySQLi for database access
- Minimal dependencies
- Bootstrap through `config.php` on every page
