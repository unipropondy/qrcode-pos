-- Run this script in your SQL Server database to create the AppUsers table

CREATE TABLE AppUsers (
  UserId UNIQUEIDENTIFIER PRIMARY KEY,
  FullName NVARCHAR(100),
  Username NVARCHAR(50) UNIQUE NOT NULL,
  PasswordHash NVARCHAR(255) NOT NULL,
  CreatedAt DATETIME DEFAULT GETDATE()
);
