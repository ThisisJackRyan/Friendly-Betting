import { Link } from "react-router-dom";
import { CSSTransition } from 'react-transition-group';



const Header = () => {
    return(
        <div className="header">
            <div className="x1">
                <div className="logo"><Link className="Link" to="/">logo</Link>
                
                </div>
            </div>
            <div className="x1">Title of website</div>
            <div className="flex pages x1">
                <Link className="Link" to="/SignIn">signIn</Link>
                <Link className="Link" to="/NewBet">Create New Bet</Link>
            </div>
        </div>
    )
}

export default Header;