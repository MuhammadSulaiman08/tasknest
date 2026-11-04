-- Runs once when the Docker volume is first created: adds the database used by the API tests
CREATE DATABASE tasknest_test OWNER tasknest;
