import React, { useContext, useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import './Layout.css';

const Layout = () => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const { branchslug } = useParams();
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 1024 : false
  );

  const activeBranchSlug = branchslug || user?.branch_code || 'main';
  const branchPath = (path) => `/${activeBranchSlug}/${path}`;
  const isActive = (path) => location.pathname === branchPath(path) || location.pathname.startsWith(branchPath(path) + '/');
  const isAdminMobile = user?.role === 'admin' && isMobileNav;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onResize = () => {
      setIsMobileNav(window.innerWidth <= 1024);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) {
      setOpenDropdowns({});
    }
  }, [mobileMenuOpen]);

  const toggleDropdown = (dropdownName) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [dropdownName]: !prev[dropdownName]
    }));
  };

  const openDropdown = (dropdownName) => {
    setOpenDropdowns(prev => ({
      ...prev,
      [dropdownName]: true
    }));
  };

  const closeDropdown = (dropdownName) => {
    setOpenDropdowns(prev => ({
      ...prev,
      [dropdownName]: false
    }));
  };

  // Keep dropdowns open if they have active children
  const isDropdownOpen = (dropdownName, hasActiveChild) => {
    return openDropdowns[dropdownName] !== false && (openDropdowns[dropdownName] || hasActiveChild);
  };

  const getInitials = (name) => {
    if (!name) return 'NA';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-brand">
            <h2>Nanchu Hospitality – Operations</h2>
          </div>
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation"
            aria-expanded={mobileMenuOpen}
          >
            <span />
            <span />
            <span />
          </button>

          <div className={`nav-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
            {user?.role !== 'night_manager' && (
              <Link to={branchPath('dashboard')} className={isActive('dashboard') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
                <span className="link-text">Dashboard</span>
              </Link>
            )}
            {user?.role === 'admin' && !isAdminMobile && (
              <div 
                className={`nav-dropdown ${isActive('sales') ? 'active-parent' : ''} ${isDropdownOpen('operations', isActive('sales')) ? 'open' : ''}`}
                onMouseEnter={() => openDropdown('operations')}
                onMouseLeave={() => closeDropdown('operations')}
              >
                <button type="button" className="nav-dropdown-toggle" onClick={() => toggleDropdown('operations')}>
                  <span className="link-text">Operations</span>
                  <span className="dropdown-arrow">▼</span>
                </button>
                <div className="mega-menu">
                  <div className="mega-menu-content">
                    <div className="mega-menu-section">
                      <Link to={branchPath('sales')} className={`mega-menu-item ${isActive('sales') ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                        <div className="mega-menu-item-title">Sales Records</div>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {isAdminMobile && (
              <Link to={branchPath('sales')} className={isActive('sales') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
                <span className="link-text">Sales Records</span>
              </Link>
            )}
            {user?.role !== 'admin' && (
              <Link to={branchPath('sales')} className={isActive('sales') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
                <span className="link-text">Sales Records</span>
              </Link>
            )}
            {user?.role === 'admin' && !isAdminMobile && (
              <div 
                className={`nav-dropdown ${isActive('employees') || isActive('positions') ? 'active-parent' : ''} ${isDropdownOpen('employees', isActive('employees') || isActive('positions')) ? 'open' : ''}`}
                onMouseEnter={() => openDropdown('employees')}
                onMouseLeave={() => closeDropdown('employees')}
              >
                <button type="button" className="nav-dropdown-toggle" onClick={() => toggleDropdown('employees')}>
                  <span className="link-text">Employees</span>
                  <span className="dropdown-arrow">▼</span>
                </button>
                <div className="mega-menu">
                  <div className="mega-menu-content">
                    <div className="mega-menu-section">
                      <Link to={branchPath('employees')} className={`mega-menu-item ${isActive('employees') ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                        <div className="mega-menu-item-title">Employees</div>
                      </Link>
                      <Link to={branchPath('positions')} className={`mega-menu-item ${isActive('positions') ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                        <div className="mega-menu-item-title">Positions</div>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {isAdminMobile && (
              <>
                <Link to={branchPath('employees')} className={isActive('employees') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
                  <span className="link-text">Employees</span>
                </Link>
                <Link to={branchPath('positions')} className={isActive('positions') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
                  <span className="link-text">Positions</span>
                </Link>
              </>
            )}
            {(user?.role === 'night_manager' || user?.role === 'branch_admin') && (
              <Link to={branchPath('employees')} className={isActive('employees') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
                <span className="link-text">Employees</span>
              </Link>
            )}
            {(user?.role === 'admin' || user?.role === 'branch_admin') && (
              <Link to={branchPath('users')} className={isActive('users') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
                <span className="link-text">Users</span>
              </Link>
            )}
            {user?.role === 'admin' && (
              <Link to={branchPath('branches')} className={isActive('branches') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
                <span className="link-text">Branches</span>
              </Link>
            )}
            <div className="nav-user-mobile">
              <div className="user-avatar">{getInitials(user?.full_name || user?.username || 'NA')}</div>
              <div className="user-info">
                <div className="user-name">{user?.full_name || user?.username || 'User'}</div>
                <div className="user-role">
                  {user?.role === 'night_manager'
                    ? 'Night Manager'
                    : user?.role === 'admin'
                    ? 'Admin'
                    : user?.role === 'branch_admin'
                    ? 'Branch Admin'
                    : 'Employee'}
                </div>
              </div>
              <button onClick={logout} className="logout-btn">
                Logout
              </button>
            </div>
          </div>

          <div className="nav-user nav-user-desktop">
            <div className="user-avatar">{getInitials(user?.full_name || user?.username || 'NA')}</div>
            <div className="user-info">
              <div className="user-name">{user?.full_name || user?.username || 'User'}</div>
              <div className="user-role">
                {user?.role === 'night_manager'
                  ? 'Night Manager'
                  : user?.role === 'admin'
                  ? 'Admin'
                  : user?.role === 'branch_admin'
                  ? 'Branch Admin'
                  : 'Employee'}
              </div>
            </div>
            <button onClick={logout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
