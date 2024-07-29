import React from 'react';
import css from './Components.module.css';



const Buttons = ({click, text, a, size}) => {

    const buttonColor = a === "betButton" ? css.betButton : css.redSpring
    // const buttonType = size === "big" ? css.big : css.small


    return (
        <div className={`box-shadow rounded-md cursor-pointer ${buttonColor}`} onClick={click}>
            <div>{text}</div>
        </div>
    );
}

export default Buttons;
