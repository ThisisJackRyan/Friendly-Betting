import { Link, useLocation} from "react-router-dom";



const Header = () => {
    const location = useLocation();

    return(
        <div className="header">
            <div className="x1">
                <div className="logo"><Link className="Link" to="/">logo</Link>
                
                </div>
            </div>
            <div className="x1">Friendly Bets</div>
            <div className="flex pages x1">
            {location.pathname !== "/SignIn" ? <Link className="Link" to="/SignIn">Sign In</Link>: <Link className="Link" to="/">Sign In</Link>
            
            
            
            }
                <Link className="Link" to="/NewBet">Create New Bet</Link>
            </div>
        </div>
    )
}

export default Header;