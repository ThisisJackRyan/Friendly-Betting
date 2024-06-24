import React from 'react';
import { IconContext } from 'react-icons';
import { RxHamburgerMenu } from 'react-icons/rx';

const Hamburger = ({action, divStyle, IconStyle, backgroundColor=''}) => {
    return (
        <IconContext.Provider value={{ color: backgroundColor, className: IconStyle }}>
            <div className={divStyle}>
                <RxHamburgerMenu  onClick={action}/>
            </div>
        </IconContext.Provider>
    );
};

export default Hamburger;