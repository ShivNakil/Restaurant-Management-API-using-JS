# Store Report Generator

This project is an Express.js application that generates reports based on store status and operating hours fetched from a PostgreSQL database.

## Installation

1. Clone the repository to your local machine:

    ```
    git clone https://github.com/ShivNakil/Restaurant-Management-API-using-JS.git
    ```

2. Navigate to the project directory:

    ```
    cd Restaurant-Management-API-using-JS
    ```

3. Install dependencies using npm:

    ```
    npm install -y
    ```

## Database Setup

Before running the application, you need to set up the PostgreSQL database and create the necessary tables. Run the following SQL commands to create the tables:

```sql
-- Create store_status table
CREATE TABLE store_status (
    store_id VARCHAR(50),
    status VARCHAR(10),
    timestamp_utc TIMESTAMP
);

-- Create store_hours table
CREATE TABLE store_hours (
    store_id VARCHAR(50),
    day INT,
    start_time_local TIME,
    end_time_local TIME
);

-- Create store_timezone table
CREATE TABLE store_timezone (
    store_id VARCHAR(50),
    timezone_str VARCHAR(50)
);
```


## Running the Application

To run the application, execute the following command:

```
node start
```

This will start the Express.js server, and it will be accessible at `http://localhost:3000`.

## Testing the APIs

To test the APIs, you can use the provided test script. Make sure the server is running before running the tests.

Run the test script using the following command:

```
node test.js
```

This script triggers report generation, waits for a few seconds, and then checks the report status or downloads the report.

## Thank You

Thank you for using Store Report Generator! If you have any questions or feedback, feel free to contact us.
