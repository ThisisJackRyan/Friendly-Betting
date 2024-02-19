import React from 'react';
import css from './Components.module.css';



const Buttons = (props) => {

    const buttonColor = props.a === "greenButton" ? css.greenButtons : css.redSpring
    const buttonType = props.size === "big" ? css.big : css.small


    return (
        <div className={buttonColor} onClick={props.click}>
            <div>{props.text}</div>
        </div>
    );
}

export default Buttons;
