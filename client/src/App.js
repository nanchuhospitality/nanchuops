import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SalesEntry from './pages/SalesEntry';
import SalesList from './pages/SalesList';
import Users from './pages/Users';
import Branches from './pages/Branches';
import Employees from './pages/Employees';
import Positions from './pages/Positions';
import Layout from './components/Layout';
import './App.css';

const RedirectBasedOnRole = () => {
  const { user } = useContext(AuthContext);
  const branchSlug = user?.branch_code || 'main';
  if (user?.role === 'night_manager') {
    return <Navigate to={`/${branchSlug}/sales`} replace />;
  }
  return <Navigate to={`/${branchSlug}/dashboard`} replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <RedirectBasedOnRole />
              </PrivateRoute>
            }
          />
            <Route
            path="/:branchslug"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<RedirectBasedOnRole />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="sales" element={<SalesList />} />
            <Route path="sales/new" element={<SalesEntry />} />
            <Route path="sales/edit/:id" element={<SalesEntry />} />
            <Route path="employees" element={<Employees />} />
            <Route path="positions" element={<Positions />} />
            <Route path="users" element={<Users />} />
            <Route path="branches" element={<Branches />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
